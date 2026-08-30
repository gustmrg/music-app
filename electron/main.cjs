const { app, BrowserWindow, ipcMain, shell } = require("electron")
const path = require("node:path")

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 820,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#131316",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? url.startsWith("http://127.0.0.1:5173") : url.startsWith("file:")
    if (!allowed) event.preventDefault()
  })

  if (isDev) win.loadURL("http://127.0.0.1:5173")
  else win.loadFile(path.join(__dirname, "../dist/index.html"))
}

ipcMain.on("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize())
ipcMain.on("window:toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  win.isMaximized() ? win.unmaximize() : win.maximize()
})
ipcMain.on("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close())

app.whenReady().then(() => {
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
