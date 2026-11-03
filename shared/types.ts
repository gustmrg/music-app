// Data shared by the main process, the preload, and the renderer. Values
// crossing IPC must be structured-cloneable, so these are plain data only.

export type TrackTags = { artist?: string; albumArtist?: string; album?: string; genre?: string; year?: number; trackNo?: number; discNo?: number; duration?: number; cover?: string }
export type TrackSource = "youtube" | "torrent"
export type Track = TrackTags & { id: string; path: string; title: string; folder: string; format: string; url?: string; source?: TrackSource; isLive?: boolean; infoHash?: string; addedAt?: number; scanned?: boolean }
// In-app tag overrides; files are never modified. "" (or year 0) clears a field.
export type TagEdit = { artist?: string; albumArtist?: string; album?: string; genre?: string; year?: number }
export type Playlist = { id: string; name: string; trackIds: string[] }

export type DiscoverProvider = "prowlarr" | "torznab"
export type DiscoverConnection = { url: string; apiKey: string; categories: string }
// Top-level fields are the active provider's; profiles keep each provider's own.
export type DiscoverSettings = DiscoverConnection & { provider: DiscoverProvider; profiles: Partial<Record<DiscoverProvider, DiscoverConnection>>; noticeAccepted: boolean }
export type DiscoverResult = { title: string; artist: string; album: string; year: string; format: string; display: string; size: number; seeders: number; indexer: string; publishedAt: string; source: string }
export type DiscoverTest = { ok: true; hint: string }

export type Preferences = { liked: string[]; recent: string[]; playlists: Playlist[]; volume: number; discover: DiscoverSettings; tagEdits: Record<string, TagEdit> }
export type Library = Preferences & { tracks: Track[]; saveFolder: string }
export type ImportResult = { tracks: Track[]; imported: string[]; skipped: number; playlist?: Playlist }

export type TorrentFile = { index: number; name: string; length: number; isAudio: boolean }
export type TorrentExpansion = { infoHash: string; name: string; files: TorrentFile[] }
export type PreparedTorrentTrack = { id: string; infoHash: string; name: string; fileName: string; length: number; url: string }
export type SaveProgress = { files: number; done: number; progress: number }
export type TorrentProgress = { infoHash: string; name: string; progress: number; peers: number; speed: number; saving?: SaveProgress }
export type SaveStarted = { infoHash: string; name: string; queued: number; pending: number }
export type TorrentSaved = { name: string; saved: number; failed: number; cancelled: boolean; result: ImportResult | null; error?: string }

export type YouTubeResolved = { url: string; isLive: boolean }
