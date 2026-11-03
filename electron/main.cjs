const { app, BrowserWindow, ipcMain, dialog, protocol } = require("electron")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const { LocalLibrary, AUDIO_EXTENSIONS } = require("./library.cjs")
const { audioResponse } = require("./audio.cjs")
const { parseYouTubeLinks, fetchVideos, resolveStream, MAX_PLAYLIST_ENTRIES } = require("./youtube.cjs")
const { searchDiscover, testDiscover, cleanDiscoverSettings, isIndexerUrl } = require("./discover.cjs")
const { TorrentEngine } = require("./torrent.cjs")
const { coverResponse } = require("./metadata.cjs")

const isDev = !app.isPackaged
const entryURL = isDev ? "http://127.0.0.1:5173/" : pathToFileURL(path.join(__dirname, "../dist/index.html")).href
let library
let ready
let operations = Promise.resolve()
let engine
protocol.registerSchemesAsPrivileged([
  { scheme: "local-music", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
])

function trusted(event) {
  return event.senderFrame === event.sender.mainFrame && event.senderFrame.url === entryURL
}

// Library mutations run one at a time, whether they come from IPC or from
// background work such as a finished torrent save.
function enqueue(action) {
  const operation = operations.catch(() => {}).then(action)
  operations = operation
  return operation
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error("Origem não autorizada.")
    await ready
    return enqueue(() => action(BrowserWindow.fromWebContents(event.sender), ...args))
  })
}

function broadcast(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channel, payload)
  }
}

// Discover and torrent calls stay outside the serialized library queue:
// metadata waits can take up to a minute and must not block library imports.
function handleConcurrent(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error("Origem não autorizada.")
    await ready
    return action(BrowserWindow.fromWebContents(event.sender), ...args)
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 820, minHeight: 600,
    show: false, frame: false, backgroundColor: "#131316", title: "Local Music",
    // In packaged builds the icon is embedded by electron-builder; this covers dev and unpacked Linux runs.
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.once("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  win.webContents.on("will-navigate", (event, url) => { if (url !== entryURL) event.preventDefault() })
  win.loadURL(entryURL)
}

for (const [channel, action] of [
  ["window:minimize", (win) => win.minimize()],
  ["window:toggle-maximize", (win) => win.isMaximized() ? win.unmaximize() : win.maximize()],
  ["window:close", (win) => win.close()],
]) {
  ipcMain.on(channel, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (trusted(event) && win) action(win)
  })
}

handle("library:load", () => library.snapshot())
handle("library:files", async (win) => {
  const selection = await dialog.showOpenDialog(win, { title: "Abrir músicas", properties: ["openFile", "multiSelections"], filters: [{ name: "Áudio", extensions: AUDIO_EXTENSIONS }] })
  return selection.canceled ? null : library.addFiles(selection.filePaths)
})
handle("library:folder", async (win) => {
  const selection = await dialog.showOpenDialog(win, { title: "Adicionar pasta de músicas", properties: ["openDirectory"] })
  return selection.canceled ? null : library.addFolder(selection.filePaths[0])
})
handle("library:import-playlist", async (win) => {
  const selection = await dialog.showOpenDialog(win, { title: "Importar playlist local", properties: ["openFile"], filters: [{ name: "Playlist UTF-8", extensions: ["m3u8", "m3u"] }] })
  return selection.canceled ? null : library.importPlaylist(selection.filePaths[0])
})
handle("library:export-playlist", async (win, ids) => {
  const selection = await dialog.showSaveDialog(win, { title: "Exportar playlist", defaultPath: "Playlist.m3u8", filters: [{ name: "Playlist UTF-8", extensions: ["m3u8"] }] })
  if (selection.canceled || !selection.filePath) return false
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
const streamCache = new Map()
const STREAM_CACHE_TTL = 4 * 60 * 60 * 1000

handle("youtube:add", async (_win, text, name) => {
  const { targets, invalid } = parseYouTubeLinks(text)
  if (!targets.length) throw new Error("Nenhum link do YouTube válido foi encontrado no texto enviado.")
  const videos = []
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

handle("youtube:resolve", async (_win, id) => {
  const track = library.snapshot().tracks.find((item) => item.id === id && item.source === "youtube")
  if (!track) throw new Error("Esta música do YouTube não está mais na biblioteca.")
  const cached = streamCache.get(id)
  if (cached && cached.expires > Date.now()) return { url: cached.url, isLive: cached.isLive }
  const { url, isLive } = await resolveStream(track.path)
  streamCache.set(id, { url, isLive, expires: Date.now() + STREAM_CACHE_TTL })
  if (await library.setLive(id, isLive)) broadcast("library:tracks", library.snapshot().tracks)
  return { url, isLive }
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
  let music
  try { music = app.getPath("music") } catch { music = path.join(app.getPath("home"), "Music") }
  return path.join(music, "Local Music")
}

app.whenReady().then(() => {
  const coversDir = path.join(app.getPath("userData"), "covers")
  library = new LocalLibrary(path.join(app.getPath("userData"), "local-library.json"), { defaultSaveFolder: defaultSaveFolder(), coversDir })
  ready = library.load()
  // Keep a corrupt library intact and report the failure through the UI.
  ready.catch((error) => console.error("Unable to load local library:", error.message))
  // Tracks imported before tag support get their tags in the background.
  ready.then(() => library.scanPending((tracks) => broadcast("library:tracks", tracks)))
    .catch((error) => console.error("Unable to read track tags:", error.message))
  // Download links are fetched only from the configured indexer's origin.
  engine = new TorrentEngine({ cachePath: path.join(app.getPath("userData"), "torrent-cache"), allowUrl: (url) => isIndexerUrl(library.preferences.discover, url) })
  engine.onProgress = (snapshot) => broadcast("torrent:progress", snapshot)
  engine.onSaved = ({ name, paths, failed, cancelled }) => {
    const summary = { name, saved: paths.length, failed, cancelled }
    enqueue(async () => {
      await ready
      broadcast("torrent:saved", { ...summary, result: paths.length ? await library.addFiles(paths) : null })
    }).catch((error) => broadcast("torrent:saved", { ...summary, result: null, error: error instanceof Error ? error.message : String(error) }))
  }
  // Stream-only posture: nothing from a previous session is ever seeded again.
  engine.resetCache().catch(() => {})
  protocol.handle("local-music", async (request) => {
    try {
      await ready
      const url = new URL(request.url)
      if (url.hostname === "cover") return coverResponse(url, coversDir)
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
  operations.catch(() => {}).then(() => engine?.destroy()).catch(() => {})
    .then(() => operations).catch(() => {}).then(() => library?.writes).catch(() => {})
    .finally(() => { quitting = true; app.quit() })
})
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
