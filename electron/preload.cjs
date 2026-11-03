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
  searchDiscover: (query) => ipcRenderer.invoke("discover:search", query),
  testDiscover: (settings) => ipcRenderer.invoke("discover:test", settings),
  expandTorrent: (source) => ipcRenderer.invoke("torrent:expand", source),
  prepareTorrent: (source, fileIndex) => ipcRenderer.invoke("torrent:prepare", source, fileIndex),
  releaseTorrent: (id) => ipcRenderer.invoke("torrent:release", id),
  stopTorrents: (includeSaves) => ipcRenderer.invoke("torrent:stop", includeSaves === true),
  saveTorrent: (source, fileIndexes) => ipcRenderer.invoke("torrent:save", source, fileIndexes),
  saveTorrentTrack: (id) => ipcRenderer.invoke("torrent:save-track", id),
  chooseSaveFolder: () => ipcRenderer.invoke("library:save-folder"),
  onTorrentSaved: (listener) => {
    const handler = (_event, outcome) => listener(outcome)
    ipcRenderer.on("torrent:saved", handler)
    return () => ipcRenderer.removeListener("torrent:saved", handler)
  },
  onTorrentProgress: (listener) => {
    const handler = (_event, snapshot) => listener(snapshot)
    ipcRenderer.on("torrent:progress", handler)
    return () => ipcRenderer.removeListener("torrent:progress", handler)
  },
})
