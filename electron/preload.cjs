const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  loadLibrary: () => ipcRenderer.invoke("library:load"),
  openFiles: () => ipcRenderer.invoke("library:files"),
  openFolder: () => ipcRenderer.invoke("library:folder"),
  importPlaylist: () => ipcRenderer.invoke("library:import-playlist"),
  exportPlaylist: (ids) => ipcRenderer.invoke("library:export-playlist", ids),
  savePreferences: (preferences) => ipcRenderer.invoke("library:preferences", preferences),
  addYoutube: (text, name) => ipcRenderer.invoke("youtube:add", text, name),
  resolveYoutube: (id) => ipcRenderer.invoke("youtube:resolve", id),
})
