/// <reference types="vite/client" />

interface Window {
  desktop?: {
    platform: string
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    loadLibrary: () => Promise<import("./library").Library>
    openFiles: () => Promise<import("./library").ImportResult | null>
    openFolder: () => Promise<import("./library").ImportResult | null>
    importPlaylist: () => Promise<import("./library").ImportResult | null>
    exportPlaylist: (ids: string[]) => Promise<boolean>
    savePreferences: (preferences: import("./library").Preferences) => Promise<void>
    addYoutube: (text: string, name?: string) => Promise<import("./library").ImportResult>
    resolveYoutube: (id: string) => Promise<{ url: string }>
    searchDiscover: (query: string) => Promise<{ results: import("./library").DiscoverResult[] }>
    testDiscover: (settings: import("./library").DiscoverSettings) => Promise<{ ok: true; hint: string }>
    expandTorrent: (source: string) => Promise<import("./library").TorrentExpansion>
    prepareTorrent: (source: string, fileIndex: number) => Promise<import("./library").PreparedTorrentTrack>
    releaseTorrent: (id: string) => Promise<void>
    stopTorrents: (includeSaves?: boolean) => Promise<void>
    saveTorrent: (source: string, fileIndexes: number[]) => Promise<import("./library").SaveStarted>
    saveTorrentTrack: (id: string) => Promise<import("./library").SaveStarted>
    chooseSaveFolder: () => Promise<string | null>
    onTorrentSaved: (listener: (outcome: import("./library").TorrentSaved) => void) => () => void
    onTorrentProgress: (listener: (snapshot: import("./library").TorrentProgress[]) => void) => () => void
  }
}
