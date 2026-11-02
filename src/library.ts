export type Track = { id: string; path: string; title: string; folder: string; format: string; url?: string; source?: "youtube" }
export type Playlist = { id: string; name: string; trackIds: string[] }
export type Preferences = { liked: string[]; recent: string[]; playlists: Playlist[]; volume: number }
export type Library = Preferences & { tracks: Track[] }
export type ImportResult = { tracks: Track[]; imported: string[]; skipped: number; playlist?: Playlist }
export const emptyLibrary: Library = { tracks: [], liked: [], recent: [], playlists: [], volume: 0.7 }
export const audioExtensions = /\.(mp3|wav|flac|ogg|opus|m4a|aac|webm)$/i
export const folderName = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() || "Arquivos avulsos"
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
}
export function filterTracks(tracks: Track[], search: string) {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
  const query = normalize(search.trim())
  return query ? tracks.filter((track) => normalize(`${track.title} ${track.path}`).includes(query)) : tracks
}
