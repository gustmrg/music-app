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
  }
}
