import type {
  DiscoverResult, DiscoverSettings, DiscoverTest, ImportResult, Library, Preferences, PreparedTorrentTrack,
  SaveStarted, TorrentExpansion, TorrentProgress, TorrentSaved, Track, YouTubeResolved,
} from "./types.ts"

// The single IPC contract. electron/main.ts registers handlers against it,
// electron/preload.ts exposes it as window.desktop, and the renderer reads
// window.desktop through DesktopApi, so a mismatch fails `npm run typecheck`.
// Arguments arrive from the renderer and are still validated at runtime.

// ipcRenderer.invoke → ipcMain.handle, with a reply.
export interface InvokeChannels {
  "library:load": { args: []; result: Library }
  "library:files": { args: []; result: ImportResult | null }
  "library:folder": { args: []; result: ImportResult | null }
  "library:import-playlist": { args: []; result: ImportResult | null }
  "library:export-playlist": { args: [ids: string[]]; result: boolean }
  "library:preferences": { args: [preferences: Preferences]; result: void }
  "library:save-folder": { args: []; result: string | null }
  "youtube:add": { args: [text: string, name?: string]; result: ImportResult }
  // fresh skips the cached stream URL, e.g. after it failed to play.
  "youtube:resolve": { args: [id: string, fresh?: boolean]; result: YouTubeResolved }
  "discover:search": { args: [query: string]; result: { results: DiscoverResult[] } }
  "discover:test": { args: [settings: DiscoverSettings]; result: DiscoverTest }
  "torrent:expand": { args: [source: string]; result: TorrentExpansion }
  "torrent:prepare": { args: [source: string, fileIndex: number]; result: PreparedTorrentTrack }
  "torrent:release": { args: [id: string]; result: void }
  "torrent:stop-one": { args: [infoHash: string]; result: void }
  "torrent:stop": { args: [includeSaves: boolean]; result: void }
  "torrent:save": { args: [source: string, fileIndexes: number[]]; result: SaveStarted }
  "torrent:save-track": { args: [id: string]; result: SaveStarted }
}

// ipcRenderer.send → ipcMain.on, fire and forget.
export type SendChannel = "window:minimize" | "window:toggle-maximize" | "window:close"

// webContents.send → ipcRenderer.on, pushed by the main process.
export interface EventChannels {
  "library:tracks": Track[]
  "torrent:progress": TorrentProgress[]
  "torrent:saved": TorrentSaved
}

export type InvokeChannel = keyof InvokeChannels
export type InvokeArgs<C extends InvokeChannel> = InvokeChannels[C]["args"]
export type InvokeResult<C extends InvokeChannel> = InvokeChannels[C]["result"]

type Invoke<C extends InvokeChannel> = (...args: InvokeArgs<C>) => Promise<InvokeResult<C>>
type Subscribe<E extends keyof EventChannels> = (listener: (payload: EventChannels[E]) => void) => () => void

export interface DesktopApi {
  platform: string
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
  loadLibrary: Invoke<"library:load">
  openFiles: Invoke<"library:files">
  openFolder: Invoke<"library:folder">
  importPlaylist: Invoke<"library:import-playlist">
  exportPlaylist: Invoke<"library:export-playlist">
  savePreferences: Invoke<"library:preferences">
  chooseSaveFolder: Invoke<"library:save-folder">
  addYoutube: Invoke<"youtube:add">
  resolveYoutube: Invoke<"youtube:resolve">
  searchDiscover: Invoke<"discover:search">
  testDiscover: Invoke<"discover:test">
  expandTorrent: Invoke<"torrent:expand">
  prepareTorrent: Invoke<"torrent:prepare">
  releaseTorrent: Invoke<"torrent:release">
  stopTorrent: Invoke<"torrent:stop-one">
  stopTorrents: (includeSaves?: boolean) => Promise<InvokeResult<"torrent:stop">>
  saveTorrent: Invoke<"torrent:save">
  saveTorrentTrack: Invoke<"torrent:save-track">
  onTorrentSaved: Subscribe<"torrent:saved">
  onLibraryTracks: Subscribe<"library:tracks">
  onTorrentProgress: Subscribe<"torrent:progress">
}
