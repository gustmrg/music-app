const { app, BrowserWindow, ipcMain, dialog, protocol } = require("electron")
const path = require("node:path")
const { pathToFileURL } = require("node:url")
const { LocalLibrary, AUDIO_EXTENSIONS } = require("./library.cjs")
const { audioResponse } = require("./audio.cjs")
const { parseYouTubeLinks, fetchVideos, resolveStream, MAX_PLAYLIST_ENTRIES } = require("./youtube.cjs")

const isDev = !app.isPackaged
const entryURL = isDev ? "http://127.0.0.1:5173/" : pathToFileURL(path.join(__dirname, "../dist/index.html")).href
let library
let ready
let operations = Promise.resolve()
protocol.registerSchemesAsPrivileged([
  { scheme: "local-music", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
])

function trusted(event) {
  return event.senderFrame === event.sender.mainFrame && event.senderFrame.url === entryURL
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) throw new Error("Origem não autorizada.")
    await ready
    const operation = operations.catch(() => {}).then(() => action(BrowserWindow.fromWebContents(event.sender), ...args))
    operations = operation
    return operation
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

// Googlevideo stream URLs expire after a few hours; cache only within that window.
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
  if (cached && cached.expires > Date.now()) return { url: cached.url }
  const url = await resolveStream(track.path)
  streamCache.set(id, { url, expires: Date.now() + STREAM_CACHE_TTL })
  return { url }
})

app.whenReady().then(() => {
  library = new LocalLibrary(path.join(app.getPath("userData"), "local-library.json"))
  ready = library.load()
  // Keep a corrupt library intact and report the failure through the UI.
  ready.catch((error) => console.error("Unable to load local library:", error.message))
  protocol.handle("local-music", async (request) => {
    try {
      await ready
      return audioResponse(request, library)
    } catch { return new Response(null, { status: 404 }) }
  })
  createWindow()
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

let quitting = false
app.on("before-quit", (event) => {
  if (quitting) return
  event.preventDefault()
  operations.catch(() => {}).then(() => library?.writes).catch(() => {}).finally(() => { quitting = true; app.quit() })
})
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
