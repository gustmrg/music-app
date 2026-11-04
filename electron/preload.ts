import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import type { DesktopApi, EventChannels, InvokeArgs, InvokeChannel, InvokeResult, SendChannel } from "../shared/ipc.ts"

// Bundled to dist-electron/preload.cjs: sandboxed preloads must be CommonJS
// and may require only "electron", so this file imports types and nothing else.

const invoke = <C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>) =>
  ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>

const send = (channel: SendChannel) => ipcRenderer.send(channel)

function subscribe<E extends keyof EventChannels>(channel: E) {
  return (listener: (payload: EventChannels[E]) => void) => {
    const handler = (_event: IpcRendererEvent, payload: EventChannels[E]) => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => { ipcRenderer.removeListener(channel, handler) }
  }
}

const desktop: DesktopApi = {
  platform: process.platform,
  minimize: () => send("window:minimize"),
  toggleMaximize: () => send("window:toggle-maximize"),
  close: () => send("window:close"),
  loadLibrary: () => invoke("library:load"),
  openFiles: () => invoke("library:files"),
  openFolder: () => invoke("library:folder"),
  importPlaylist: () => invoke("library:import-playlist"),
  exportPlaylist: (ids) => invoke("library:export-playlist", ids),
  savePreferences: (preferences) => invoke("library:preferences", preferences),
  addYoutube: (text, name) => invoke("youtube:add", text, name),
  resolveYoutube: (id) => invoke("youtube:resolve", id),
  searchDiscover: (query) => invoke("discover:search", query),
  testDiscover: (settings) => invoke("discover:test", settings),
  expandTorrent: (source) => invoke("torrent:expand", source),
  prepareTorrent: (source, fileIndex) => invoke("torrent:prepare", source, fileIndex),
  releaseTorrent: (id) => invoke("torrent:release", id),
  stopTorrent: (infoHash) => invoke("torrent:stop-one", infoHash),
  stopTorrents: (includeSaves) => invoke("torrent:stop", includeSaves === true),
  saveTorrent: (source, fileIndexes) => invoke("torrent:save", source, fileIndexes),
  saveTorrentTrack: (id) => invoke("torrent:save-track", id),
  chooseSaveFolder: () => invoke("library:save-folder"),
  onTorrentSaved: subscribe("torrent:saved"),
  onLibraryTracks: subscribe("library:tracks"),
  onTorrentProgress: subscribe("torrent:progress"),
}

contextBridge.exposeInMainWorld("desktop", desktop)
