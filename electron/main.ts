import { app, BrowserWindow, ipcMain, dialog, protocol } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { EventChannels, InvokeArgs, InvokeChannel, InvokeResult, SendChannel } from "../shared/ipc.ts"
import type { Library, YouTubeResolved } from "../shared/types.ts"
import { LocalLibrary, AUDIO_EXTENSIONS } from "./library.ts"
import { audioResponse } from "./audio.ts"
import { parseYouTubeLinks, fetchVideos, resolveStream } from "./youtube.ts"
import type { YouTubeVideo } from "./youtube.ts"
import { searchDiscover, testDiscover, cleanDiscoverSettings, isIndexerUrl } from "./discover.ts"
import { TorrentEngine } from "./torrent.ts"
import { coverResponse } from "./metadata.ts"
import { LiveStreams, ffmpegAvailable, FFMPEG_MISSING } from "./live.ts"

// This file is bundled to dist-electron/main.cjs, next to preload.cjs.
const isDev = !app.isPackaged
const entryURL = isDev ? "http://127.0.0.1:5173/" : pathToFileURL(path.join(import.meta.dirname, "../dist/index.html")).href
// Both are created once the app is ready, before any handler can run.
let library: LocalLibrary
let engine: TorrentEngine
let ready: Promise<Library>
let operations: Promise<unknown> = Promise.resolve()
protocol.registerSchemesAsPrivileged([
  { scheme: "local-music", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
])

function trusted(event: IpcMainEvent | IpcMainInvokeEvent) {
  return event.senderFrame === event.sender.mainFrame && event.senderFrame.url === entryURL
}

// Library mutations run one at a time, whether they come from IPC or from
// background work such as a finished torrent save.
function enqueue<T>(action: () => T | Promise<T>): Promise<T> {
  const operation = operations.catch(() => {}).then(action)
  operations = operation
  return operation
}

// Handlers are typed by the shared IPC contract, so a handler whose result
// differs from what the renderer expects fails the typecheck.
type Handler<C extends InvokeChannel> = (win: BrowserWindow, ...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>

function register<C extends InvokeChannel>(channel: C, action: Handler<C>, queued: boolean) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error("Origem não autorizada.")
    await ready
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error("Janela não encontrada.")
    const run = () => action(win, ...(args as InvokeArgs<C>))
    return queued ? enqueue(run) : run()
  })
}

function handle<C extends InvokeChannel>(channel: C, action: Handler<C>) {
  register(channel, action, true)
}

function broadcast<E extends keyof EventChannels>(channel: E, payload: EventChannels[E]) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channel, payload)
  }
}

// Discover and torrent calls stay outside the serialized library queue:
// metadata waits can take up to a minute and must not block library imports.
function handleConcurrent<C extends InvokeChannel>(channel: C, action: Handler<C>) {
  register(channel, action, false)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 820, minHeight: 600,
    show: false, frame: false, backgroundColor: "#131316", title: "Local Music",
    // In packaged builds the icon is embedded by electron-builder; this covers dev and unpacked Linux runs.
    icon: path.join(import.meta.dirname, "../build/icon.png"),
    webPreferences: { preload: path.join(import.meta.dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.once("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  win.webContents.on("will-navigate", (event, url) => { if (url !== entryURL) event.preventDefault() })
  win.loadURL(entryURL)
}

const windowActions: [SendChannel, (win: BrowserWindow) => void][] = [
  ["window:minimize", (win) => win.minimize()],
  ["window:toggle-maximize", (win) => win.isMaximized() ? win.unmaximize() : win.maximize()],
  ["window:close", (win) => win.close()],
]
for (const [channel, action] of windowActions) {
  ipcMain.on(channel, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (trusted(event) && win) action(win)
  })
}

// Since Electron 43, dialogs without defaultPath always open in Downloads,
// so the library dialogs share the last folder the user picked from.
let lastDialogFolder = ""
const startIn = (name = "") => lastDialogFolder ? path.join(lastDialogFolder, name) : name || undefined
const rememberFolder = (folder: string) => { if (folder) lastDialogFolder = folder }

handle("library:load", () => library.snapshot())
handle("library:files", async (win) => {
  const selection = await dialog.showOpenDialog(win, { title: "Abrir músicas", defaultPath: startIn(), properties: ["openFile", "multiSelections"], filters: [{ name: "Áudio", extensions: AUDIO_EXTENSIONS }] })
  if (selection.canceled) return null
  rememberFolder(path.dirname(selection.filePaths[0]))
  return library.addFiles(selection.filePaths)
})
handle("library:folder", async (win) => {
  const selection = await dialog.showOpenDialog(win, { title: "Adicionar pasta de músicas", defaultPath: startIn(), properties: ["openDirectory"] })
  if (selection.canceled) return null
  // Start the next pick next to this folder, where sibling folders live.
  rememberFolder(path.dirname(selection.filePaths[0]))
  return library.addFolder(selection.filePaths[0])
})
handle("library:import-playlist", async (win) => {
  const selection = await dialog.showOpenDialog(win, { title: "Importar playlist local", defaultPath: startIn(), properties: ["openFile"], filters: [{ name: "Playlist UTF-8", extensions: ["m3u8", "m3u"] }] })
  if (selection.canceled) return null
  rememberFolder(path.dirname(selection.filePaths[0]))
  return library.importPlaylist(selection.filePaths[0])
})
handle("library:export-playlist", async (win, ids) => {
  const selection = await dialog.showSaveDialog(win, { title: "Exportar playlist", defaultPath: startIn("Playlist.m3u8"), filters: [{ name: "Playlist UTF-8", extensions: ["m3u8"] }] })
  if (selection.canceled || !selection.filePath) return false
  rememberFolder(path.dirname(selection.filePath))
  await library.exportPlaylist(selection.filePath, ids)
  return true
})
handle("library:preferences", (_win, preferences) => library.savePreferences(preferences))
handle("library:save-folder", async (win) => {
  const selection = await dialog.showOpenDialog(win, { title: "Pasta para músicas salvas", defaultPath: library.saveFolderPath(), properties: ["openDirectory", "createDirectory"] })
  return selection.canceled ? null : library.setSaveFolder(selection.filePaths[0])
})

// Googlevideo stream URLs expire after a few hours; cache only within that window.
// Each entry keeps the URL and whether the video was live when resolved.
const streamCache = new Map<string, YouTubeResolved & { expires: number }>()
const resolving = new Map<string, Promise<YouTubeResolved>>()
const STREAM_CACHE_TTL = 4 * 60 * 60 * 1000
const lives = new LiveStreams()
let ffmpegCheck: Promise<boolean> | undefined

// Shared by the resolve IPC and the local-music://live/ route. yt-dlp can
// take seconds, so this runs outside the library queue, and concurrent calls
// for one track share one run. `fresh` skips the cache, e.g. after a live's
// manifest expired.
function resolveYouTube(id: string, fresh = false): Promise<YouTubeResolved> {
  const cached = streamCache.get(id)
  if (!fresh && cached && cached.expires > Date.now()) return Promise.resolve({ url: cached.url, isLive: cached.isLive })
  const pending = resolving.get(id)
  if (pending) return pending
  const job = (async () => {
    const track = library.snapshot().tracks.find((item) => item.id === id && item.source === "youtube")
    if (!track) throw new Error("Esta música do YouTube não está mais na biblioteca.")
    const { url, isLive } = await resolveStream(track.path)
    streamCache.set(id, { url, isLive, expires: Date.now() + STREAM_CACHE_TTL })
    void enqueue(async () => { if (await library.setLive(id, isLive)) broadcast("library:tracks", library.snapshot().tracks) }).catch(() => {})
    return { url, isLive }
  })().finally(() => resolving.delete(id))
  resolving.set(id, job)
  return job
}

handle("youtube:add", async (_win, text, name) => {
  const { targets } = parseYouTubeLinks(text)
  if (!targets.length) throw new Error("Nenhum link do YouTube válido foi encontrado no texto enviado.")
  const videos: YouTubeVideo[] = []
  let playlistTitle = ""
  for (const target of targets) {
    const result = await fetchVideos(target)
    if (!result.videos.length) continue
    videos.push(...result.videos)
    if (targets.length === 1 && target.kind === "playlist") playlistTitle = result.playlistTitle
  }
  if (!videos.length) throw new Error("Os links enviados não contêm vídeos disponíveis.")
  return library.addVideos(videos, playlistTitle || String(name ?? "").trim().slice(0, 120))
})

handleConcurrent("youtube:resolve", async (_win, id) => {
  const resolved = await resolveYouTube(id)
  // Lives play through ffmpeg; say so before the player asks for audio.
  if (resolved.isLive && !await (ffmpegCheck ??= ffmpegAvailable())) {
    ffmpegCheck = undefined
    throw new Error(FFMPEG_MISSING)
  }
  return resolved
})

// Discover: search the user-configured Prowlarr or Torznab endpoint.
handleConcurrent("discover:search", (_win, query) => searchDiscover(library.preferences.discover, query))
handleConcurrent("discover:test", (_win, settings) => testDiscover(cleanDiscoverSettings(settings ?? library.preferences.discover)))

// Torrent streaming: expand shows the files inside a torrent; prepare
// registers the virtual track that local-music://track/<id> serves.
handleConcurrent("torrent:expand", (_win, source) => engine.expand(source))
handleConcurrent("torrent:prepare", async (_win, source, fileIndex) => {
  const prepared = await engine.prepare(source, fileIndex)
  return { ...prepared, url: `local-music://track/${prepared.id}` }
})
handleConcurrent("torrent:release", (_win, id) => { engine.release(id) })
handleConcurrent("torrent:stop", (_win, includeSaves) => engine.stopAll({ includeSaves: includeSaves === true }))
// Save: keep the streamed files and add them to the library once complete.
handleConcurrent("torrent:save", (_win, source, fileIndexes) => engine.save(source, fileIndexes, library.saveFolderPath()))
handleConcurrent("torrent:save-track", (_win, id) => engine.saveTrack(id, library.saveFolderPath()))

function defaultSaveFolder() {
  let music: string
  try { music = app.getPath("music") } catch { music = path.join(app.getPath("home"), "Music") }
  return path.join(music, "Local Music")
}

app.whenReady().then(() => {
  const coversDir = path.join(app.getPath("userData"), "covers")
  library = new LocalLibrary(path.join(app.getPath("userData"), "local-library.json"), { defaultSaveFolder: defaultSaveFolder(), coversDir })
  ready = library.load()
  // Keep a corrupt library intact and report the failure through the UI.
  ready.catch((error: Error) => console.error("Unable to load local library:", error.message))
  // Tracks imported before tag support get their tags in the background.
  ready.then(() => library.scanPending((tracks) => broadcast("library:tracks", tracks)))
    .catch((error: Error) => console.error("Unable to read track tags:", error.message))
  // Download links are fetched only from the configured indexer's origin.
  engine = new TorrentEngine({ cachePath: path.join(app.getPath("userData"), "torrent-cache"), allowUrl: (url) => isIndexerUrl(library.preferences.discover, url) })
  engine.onProgress = (snapshot) => broadcast("torrent:progress", snapshot)
  engine.onSaved = ({ name, paths, failed, cancelled }) => {
    const summary = { name, saved: paths.length, failed, cancelled }
    enqueue(async () => {
      await ready
      broadcast("torrent:saved", { ...summary, result: paths.length ? await library.addFiles(paths) : null })
    }).catch((error: unknown) => broadcast("torrent:saved", { ...summary, result: null, error: error instanceof Error ? error.message : String(error) }))
  }
  // Stream-only posture: nothing from a previous session is ever seeded again.
  engine.resetCache().catch(() => {})
  protocol.handle("local-music", async (request) => {
    try {
      await ready
      const url = new URL(request.url)
      if (url.hostname === "cover") return coverResponse(url, coversDir)
      if (url.hostname === "live") {
        const id = url.pathname.slice(1)
        if (!/^[a-f0-9]{64}$/.test(id) || request.method !== "GET") return new Response(null, { status: 403 })
        if (library.tracks.get(id)?.source !== "youtube") return new Response(null, { status: 404 })
        return lives.open((fresh) => resolveYouTube(id, fresh), request.signal)
      }
      return audioResponse(request, library, engine)
    } catch { return new Response(null, { status: 404 }) }
  })
  createWindow()
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

let quitting = false
app.on("before-quit", (event) => {
  if (quitting) return
  event.preventDefault()
  // Destroying the engine cancels pending saves, which may still queue
  // library imports for files already copied; drain the queue once more.
  lives.stopAll()
  operations.catch(() => {}).then(() => engine?.destroy()).catch(() => {})
    .then(() => operations).catch(() => {}).then(() => library?.writes).catch(() => {})
    .finally(() => { quitting = true; app.quit() })
})
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
