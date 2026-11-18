import type { Library, Preferences, TagEdit, Track } from "../shared/types"

export type { TrackTags, Track, TagEdit, Playlist, DiscoverProvider, DiscoverConnection, DiscoverSettings, Preferences, Library, ImportResult, DiscoverResult, TorrentFile, TorrentExpansion, PreparedTorrentTrack, SaveProgress, TorrentProgress, SaveStarted, TorrentSaved } from "../shared/types"
export type Album = { key: string; title: string; artist: string; year?: number; cover?: string; trackIds: string[] }
export const emptyLibrary: Library = { tracks: [], liked: [], recent: [], playlists: [], tagEdits: {}, volume: 0.7, viewMode: "list", discover: { provider: "torznab", url: "", apiKey: "", categories: "3000", profiles: {}, noticeAccepted: false }, saveFolder: "", watchedFolders: [] }
// Points favorites, history, playlists, and tag edits at the new ids of
// files that were renamed or moved inside a watched folder.
export function remapTrackIds<T extends Pick<Preferences, "liked" | "recent" | "playlists" | "tagEdits">>(value: T, moved: Record<string, string>): T {
  const swap = (ids: string[]) => [...new Set(ids.map((id) => Object.hasOwn(moved, id) ? moved[id] : id))]
  return {
    ...value,
    liked: swap(value.liked),
    recent: swap(value.recent),
    playlists: value.playlists.map((playlist) => ({ ...playlist, trackIds: swap(playlist.trackIds) })),
    tagEdits: Object.fromEntries(Object.entries(value.tagEdits).map(([id, edit]) => [Object.hasOwn(moved, id) ? moved[id] : id, edit])),
  }
}
export const audioExtensions = /\.(mp3|wav|flac|ogg|opus|m4a|aac|webm)$/i
export const folderName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() || "Arquivos avulsos"
// ipcRenderer.invoke wraps main-process errors as
// "Error invoking remote method 'x': Error: message"; show only the message.
export function errorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, "").trim() : ""
  return message || fallback
}
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
}
export function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
export const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
export function filterTracks(tracks: Track[], search: string) {
  const query = normalize(search.trim())
  return query ? tracks.filter((track) => normalize(`${track.title} ${track.artist ?? ""} ${track.album ?? ""} ${track.path}`).includes(query)) : tracks
}
export const coverUrl = (track?: { cover?: string }) => track?.cover ? `local-music://cover/${track.cover}` : undefined
// YouTube tracks have no tags; their channel stands in for the artist.
export const trackArtist = (track: Track) => track.artist || (track.source === "youtube" ? track.folder : "")
export function applyTagEdit(track: Track, edit?: TagEdit): Track {
  if (!edit) return track
  const merged: Track = { ...track }
  for (const field of ["artist", "albumArtist", "album", "genre"] as const) {
    if (edit[field] !== undefined) merged[field] = edit[field] || undefined
  }
  if (edit.year !== undefined) merged.year = edit.year || undefined
  return merged
}
// Tracks group by album title plus album artist; without an album artist the
// folder stands in, so same-named albums from different rips stay apart.
export function albumKey(track: Track) {
  if (!track.album) return ""
  return `${normalize(track.album)}\u0000${track.albumArtist ? `a:${normalize(track.albumArtist)}` : `f:${track.folder}`}`
}
export const compareTrackNumbers = (a: Track, b: Track) => (a.discNo ?? 0) - (b.discNo ?? 0) || (a.trackNo ?? 0) - (b.trackNo ?? 0) || a.title.localeCompare(b.title, "pt-BR", { numeric: true })
export function buildAlbums(tracks: Track[]): Album[] {
  const groups = new Map<string, Track[]>()
  for (const track of tracks) {
    const key = albumKey(track)
    if (key) groups.set(key, [...(groups.get(key) ?? []), track])
  }
  return [...groups].map(([key, items]) => {
    const sorted = [...items].sort(compareTrackNumbers)
    const artists = new Set(sorted.map((track) => track.artist).filter(Boolean))
    return {
      key,
      title: sorted[0].album!,
      artist: sorted.find((track) => track.albumArtist)?.albumArtist ?? (artists.size === 1 ? [...artists][0]! : artists.size ? "Vários artistas" : ""),
      year: sorted.find((track) => track.year)?.year,
      cover: sorted.find((track) => track.cover)?.cover,
      trackIds: sorted.map((track) => track.id),
    }
  }).sort((a, b) => a.artist.localeCompare(b.artist, "pt-BR") || a.title.localeCompare(b.title, "pt-BR"))
}
// Torrent files usually arrive as "01 - Name.flac" or "01_Name.flac".
export function cleanTrackTitle(fileName: string) {
  const withoutExtension = fileName.replace(audioExtensions, "")
  return withoutExtension.replace(/^\s*\d{1,3}\s*[-_.\s]+\s*/, "").replace(/_/g, " ").replace(/\s{2,}/g, " ").trim() || withoutExtension
}
