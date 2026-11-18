import fs from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import type { ImportResult, Library, MissingRemoved, Preferences, TagEdit, Track } from "../shared/types.ts"
import type { TrackFiles } from "./audio.ts"
import { describeYouTube, isYouTubeTrackPath } from "./youtube.ts"
import type { YouTubeVideoInput } from "./youtube.ts"
import { cleanDiscoverSettings } from "./discover.ts"
import { readTags, cleanTags, cleanTagEdit, mapLimit } from "./metadata.ts"

// The saved library file is user data from an older or newer version, so
// its fields are checked before use.
type Loose = Record<string, any>
type LibraryOptions = { defaultSaveFolder?: string; coversDir?: string }

const TAG_READ_CONCURRENCY = 8
const STAT_CONCURRENCY = 32

export const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "webm"]
const isAudio = (file: string) => AUDIO_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase())
const isLocal = (file: unknown): file is string => typeof file === "string" && !/^[a-z][a-z\d+.-]*:/i.test(file.replace(/^[a-z]:[\\/]/i, "")) && !/^[\\/]{2}/.test(file)

// Whether file is folder itself or inside it.
export const isWithin = (folder: string, file: string) => file === folder || file.startsWith(folder.endsWith(path.sep) ? folder : folder + path.sep)

// Audio files under a folder, without following directory symlinks. Folders
// that cannot be read are reported, so their tracks are not taken as removed.
async function walkAudio(folder: string): Promise<{ files: string[]; failed: string[] }> {
  const files: string[] = []
  const failed: string[] = []
  const walk = async (directory: string) => {
    let entries
    try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { failed.push(directory); return }
    for (const entry of entries) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(file)
      else if (entry.isFile() && isAudio(file)) files.push(file)
    }
  }
  await walk(folder)
  return { files, failed }
}

const isDirectory = async (folder: string) => {
  try { return (await fs.stat(folder)).isDirectory() } catch { return false }
}

// Keeps only the outermost folders: a folder inside another is already covered.
export function outermostFolders(folders: readonly string[]): string[] {
  const unique = [...new Set(folders)].sort((a, b) => a.length - b.length)
  return unique.filter((folder, index) => !unique.slice(0, index).some((other) => isWithin(other, folder)))
}

const cleanWatchedFolders = (value: unknown): string[] =>
  outermostFolders(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && path.isAbsolute(item) && isLocal(item)) : [])

const fileStamp = (stat: { size: number; mtimeMs: number }) => ({ size: stat.size, modifiedAt: Math.trunc(stat.mtimeMs) })

export function playlistPaths(text: string, playlistFile: string): string[] {
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).flatMap((line) => {
    const value = line.trim()
    if (!value || value.startsWith("#")) return []
    let file = value
    try { if (value.startsWith("file:")) file = fileURLToPath(value) } catch { return [] }
    if (!isLocal(file)) return []
    // M3U files often use Windows separators even with relative paths.
    if (path.sep === "/") file = file.replace(/\\/g, "/")
    return [path.resolve(path.dirname(playlistFile), file)]
  })
}

export function cleanPreferences(input: unknown, tracks: Track[]): Preferences {
  const value = (input && typeof input === "object" ? input : {}) as Loose
  const ids = new Set(tracks.map((track) => track.id))
  const references = (items: unknown): string[] => Array.isArray(items) ? [...new Set(items.filter((id): id is string => ids.has(id)))] : []
  const playlistIds = new Set<string>()
  return {
    liked: references(value?.liked),
    recent: references(value?.recent).slice(0, 100),
    volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : 0.7,
    viewMode: value.viewMode === "grid" ? "grid" : "list",
    discover: cleanDiscoverSettings(value?.discover),
    tagEdits: Object.fromEntries(Object.entries(value?.tagEdits && typeof value.tagEdits === "object" ? value.tagEdits : {})
      .filter(([id]) => ids.has(id)).map(([id, edit]): [string, TagEdit] => [id, cleanTagEdit(edit)]).filter(([, edit]) => Object.keys(edit).length)),
    playlists: (Array.isArray(value?.playlists) ? value.playlists as Loose[] : []).filter((item) => {
      if (!item || typeof item.id !== "string" || playlistIds.has(item.id) || typeof item.name !== "string" || !item.name.trim()) return false
      playlistIds.add(item.id)
      return true
    }).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 120), trackIds: references(item.trackIds) })),
  }
}

// The save folder is chosen through a main-process dialog only, so it lives
// outside the preferences the renderer can overwrite.
const cleanSaveFolder = (value: unknown): string => typeof value === "string" && path.isAbsolute(value) && isLocal(value) ? value : ""

export class LocalLibrary implements TrackFiles {
  storeFile: string
  defaultSaveFolder: string
  coversDir: string
  saveFolder = ""
  watchedFolders: string[] = []
  tracks = new Map<string, Track>()
  preferences = cleanPreferences({}, [])
  writes: Promise<void> = Promise.resolve()

  constructor(storeFile: string, { defaultSaveFolder = "", coversDir = "" }: LibraryOptions = {}) {
    this.storeFile = storeFile
    this.defaultSaveFolder = defaultSaveFolder
    this.coversDir = coversDir
  }

  async load(): Promise<Library> {
    let saved: Loose
    try { saved = JSON.parse(await fs.readFile(this.storeFile, "utf8")) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.snapshot(); throw error }
    if (saved.version !== 1 || !Array.isArray(saved.tracks)) throw new Error("Biblioteca local inválida; o arquivo salvo foi preservado.")
    for (const track of saved.tracks as (Loose | null)[]) {
      if (track?.source === "youtube" && isYouTubeTrackPath(track.path)) {
        const item = { ...describeYouTube(track.path, track.title, track.folder, track.isLive), addedAt: Number.isSafeInteger(track.addedAt) ? track.addedAt : 0 }
        this.tracks.set(item.id, item)
      } else if (track && typeof track.path === "string" && path.isAbsolute(track.path) && isLocal(track.path) && isAudio(track.path)) {
        // Tags cached at import are reused; files are read again only when
        // they were never scanned (libraries saved before tags existed).
        const item: Track = { ...this.describe(track.path), ...cleanTags(track), addedAt: Number.isSafeInteger(track.addedAt) ? track.addedAt : 0 }
        if (track.scanned === true) item.scanned = true
        if (Number.isSafeInteger(track.size) && track.size >= 0 && Number.isSafeInteger(track.modifiedAt)) Object.assign(item, { size: track.size, modifiedAt: track.modifiedAt })
        if (track.missing === true) item.missing = true
        this.tracks.set(item.id, item)
      }
    }
    this.preferences = cleanPreferences(saved, [...this.tracks.values()])
    this.saveFolder = cleanSaveFolder(saved.saveFolder)
    this.watchedFolders = cleanWatchedFolders(saved.watchedFolders)
    return this.snapshot()
  }

  describe(file: string): Track {
    return {
      id: createHash("sha256").update(file).digest("hex"),
      path: file,
      title: path.basename(file, path.extname(file)),
      folder: path.dirname(file),
      format: path.extname(file).slice(1).toUpperCase(),
    }
  }

  snapshot(): Library { return { tracks: [...this.tracks.values()], ...this.preferences, saveFolder: this.saveFolderPath(), watchedFolders: [...this.watchedFolders] } }

  saveFolderPath(): string { return this.saveFolder || this.defaultSaveFolder }

  async setSaveFolder(folder: string): Promise<string> {
    const clean = cleanSaveFolder(folder)
    if (!clean) throw new Error("Escolha uma pasta local para salvar as músicas.")
    this.saveFolder = clean
    await this.persist()
    return clean
  }

  async persist(): Promise<void> {
    // Persist only an explicit choice so the default follows the OS music folder.
    const text = JSON.stringify({ version: 1, ...this.snapshot(), saveFolder: this.saveFolder })
    const write = async () => {
      await fs.mkdir(path.dirname(this.storeFile), { recursive: true })
      const temporary = `${this.storeFile}.tmp`
      await fs.writeFile(temporary, text, { mode: 0o600 })
      await fs.rename(temporary, this.storeFile)
    }
    this.writes = this.writes.catch(() => {}).then(write)
    return this.writes
  }

  // Unreadable or untagged files still import; they just have no tags.
  async withTags(track: Track, stamp?: { size: number; modifiedAt: number }): Promise<Track> {
    let tags = {}
    try { tags = await readTags(track.path, this.coversDir) } catch { /* keep the file without tags */ }
    return { ...track, ...tags, ...stamp, scanned: true }
  }

  async addFiles(files: readonly string[]): Promise<ImportResult> {
    const imported: string[] = []
    let skipped = 0
    const now = Date.now()
    const described = await mapLimit(files, TAG_READ_CONCURRENCY, async (file) => {
      try {
        if (!isLocal(file) || !isAudio(file)) return null
        const canonical = await fs.realpath(file)
        if (!isLocal(canonical) || !isAudio(canonical)) return null
        const stat = await fs.stat(canonical)
        if (!stat.isFile()) return null
        return await this.withTags(this.describe(canonical), fileStamp(stat))
      } catch { return null }
    })
    for (const track of described) {
      if (!track) { skipped++; continue }
      track.addedAt = this.tracks.get(track.id)?.addedAt || now
      this.tracks.set(track.id, track)
      imported.push(track.id)
    }
    await this.persist()
    return { tracks: [...this.tracks.values()], imported: [...new Set(imported)], skipped }
  }

  // Imports a folder and keeps watching it. Track paths are canonical, so
  // the folder is stored canonical too and contains its tracks' paths.
  async addFolder(folder: string): Promise<ImportResult> {
    let root = folder
    try { root = await fs.realpath(folder) } catch { /* reported below as an unreadable folder */ }
    const { files, failed } = await walkAudio(root)
    files.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    if (isLocal(root) && path.isAbsolute(root) && !failed.includes(root)) this.watchedFolders = outermostFolders([...this.watchedFolders, root])
    const result = await this.addFiles(files)
    if (this.markMissing(root, new Set(files), failed)) await this.persist()
    return { ...result, tracks: [...this.tracks.values()], skipped: result.skipped + failed.length, watchedFolders: [...this.watchedFolders] }
  }

  async unwatchFolder(folder: string): Promise<string[]> {
    if (this.watchedFolders.includes(folder)) {
      this.watchedFolders = this.watchedFolders.filter((item) => item !== folder)
      await this.persist()
    }
    return [...this.watchedFolders]
  }

  // Marks tracks under a folder whose files were not found. Tracks in
  // folders that could not be read are left as they are.
  markMissing(folder: string, found: ReadonlySet<string>, failed: readonly string[]): boolean {
    let changed = false
    for (const track of this.tracks.values()) {
      if (track.source || track.missing || !isWithin(folder, track.path) || found.has(track.path) || failed.some((directory) => isWithin(directory, track.path))) continue
      this.tracks.set(track.id, { ...track, missing: true })
      changed = true
    }
    return changed
  }

  // Brings the tracks under each scope (a watched folder or a folder inside
  // one) in line with the disk: new files are imported, changed files have
  // their tags read again, removed files are marked missing, and returning
  // files are restored. A removed file that reappears elsewhere with the same
  // size and modification time was renamed or moved, so the new track takes
  // over its favorites, playlists, history, and tag edits. Nothing changes
  // while a watched folder is unreachable, such as an unmounted disk.
  async reconcile(scopes: readonly string[]): Promise<{ changed: boolean; moved: Record<string, string> }> {
    let changed = false
    const moved: Record<string, string> = {}
    for (const scope of outermostFolders(scopes)) {
      const root = this.watchedFolders.find((folder) => isWithin(folder, scope))
      if (!root || !(await isDirectory(root))) continue
      // A deleted folder is reconciled from its nearest remaining parent.
      let directory = scope
      while (directory !== root && !(await isDirectory(directory))) directory = path.dirname(directory)
      const { files, failed } = await walkAudio(directory)
      if (this.markMissing(directory, new Set(files), failed)) changed = true
      const stats = await mapLimit(files, STAT_CONCURRENCY, async (file) => {
        try { const stat = await fs.stat(file); return stat.isFile() ? fileStamp(stat) : null } catch { return null }
      })
      const pending: [string, { size: number; modifiedAt: number }][] = []
      files.forEach((file, index) => {
        const stamp = stats[index]
        if (!stamp) return
        const track = this.tracks.get(this.describe(file).id)
        // Tracks saved before stamps existed keep their cached tags.
        if (track && (track.size === undefined || (track.size === stamp.size && track.modifiedAt === stamp.modifiedAt))) {
          if (track.missing || track.size === undefined) {
            const { missing: _restored, ...rest } = track
            this.tracks.set(track.id, { ...rest, ...stamp })
            changed = true
          }
        } else pending.push([file, stamp])
      })
      const read = await mapLimit(pending, TAG_READ_CONCURRENCY, ([file, stamp]) => this.withTags(this.describe(file), stamp))
      for (const track of read) {
        const previous = this.tracks.get(track.id) ?? this.movedFrom(track)
        track.addedAt = previous?.addedAt || Date.now()
        if (previous && previous.id !== track.id) {
          this.tracks.delete(previous.id)
          this.remap(previous.id, track.id)
          moved[previous.id] = track.id
        }
        this.tracks.set(track.id, track)
        changed = true
      }
    }
    if (changed) await this.persist()
    return { changed, moved }
  }

  // The single missing track with the same size, modification time, and
  // format as a new file; ambiguous matches are treated as new files.
  movedFrom(track: Track): Track | undefined {
    const matches = [...this.tracks.values()].filter((item) => item.missing && !item.source && item.size === track.size && item.modifiedAt === track.modifiedAt && item.format === track.format)
    return matches.length === 1 ? matches[0] : undefined
  }

  remap(from: string, to: string) {
    const swap = (ids: string[]) => [...new Set(ids.map((id) => id === from ? to : id))]
    const { [from]: edit, ...tagEdits } = this.preferences.tagEdits
    this.preferences = {
      ...this.preferences,
      liked: swap(this.preferences.liked),
      recent: swap(this.preferences.recent),
      playlists: this.preferences.playlists.map((playlist) => ({ ...playlist, trackIds: swap(playlist.trackIds) })),
      tagEdits: edit ? { ...tagEdits, [to]: edit } : tagEdits,
    }
  }

  // Removing tracks from the library never touches files on disk.
  async removeMissing(): Promise<MissingRemoved> {
    const removed = [...this.tracks.values()].filter((track) => track.missing).map((track) => track.id)
    if (removed.length) {
      for (const id of removed) this.tracks.delete(id)
      this.preferences = cleanPreferences(this.preferences, [...this.tracks.values()])
      await this.persist()
    }
    return { tracks: [...this.tracks.values()], removed }
  }

  async importPlaylist(file: string): Promise<ImportResult> {
    if ((await fs.stat(file)).size > 5 * 1024 * 1024) throw new Error("A playlist excede o limite de 5 MB.")
    const text = await fs.readFile(file, "utf8")
    const paths = playlistPaths(text, file)
    const result = await this.addFiles(paths)
    return {
      ...result,
      skipped: result.skipped + text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#")).length - paths.length,
      playlist: { id: randomUUID(), name: path.basename(file, path.extname(file)), trackIds: result.imported },
    }
  }

  async addVideos(videos: readonly (YouTubeVideoInput | null | undefined)[], playlistName = ""): Promise<ImportResult> {
    const imported: string[] = []
    for (const video of videos) {
      if (!video || !isYouTubeTrackPath(video.url)) continue
      const track: Track = describeYouTube(video.url, video.title, video.channel, video.isLive)
      track.addedAt = this.tracks.get(track.id)?.addedAt || Date.now()
      if (!this.tracks.has(track.id)) imported.push(track.id)
      this.tracks.set(track.id, track)
    }
    await this.persist()
    const unique = [...new Set(imported)]
    return {
      tracks: [...this.tracks.values()],
      imported: unique,
      skipped: videos.length - unique.length,
      playlist: playlistName && videos.length > 1 ? { id: randomUUID(), name: playlistName, trackIds: unique } : undefined,
    }
  }

  // A video can start or stop streaming after it was imported; playback
  // reports the current state. Returns whether the stored track changed.
  async setLive(id: string, isLive: boolean): Promise<boolean> {
    const track = this.tracks.get(id)
    if (!track || track.source !== "youtube" || track.isLive === (isLive === true)) return false
    this.tracks.set(id, { ...track, isLive: isLive === true })
    await this.persist()
    return true
  }

  // Reads tags of tracks imported before tag support, in small batches so the
  // renderer can refresh as they arrive. Returns how many were scanned.
  async scanPending(onBatch?: (tracks: Track[]) => void, batchSize = 50): Promise<number> {
    let scanned = 0
    for (;;) {
      const pending = [...this.tracks.values()].filter((track) => !track.scanned && track.source !== "youtube").slice(0, batchSize)
      if (!pending.length) return scanned
      const updated = await mapLimit(pending, TAG_READ_CONCURRENCY, (track) => this.withTags(track))
      for (const track of updated) { const current = this.tracks.get(track.id); if (current) this.tracks.set(track.id, { ...current, ...track }) }
      scanned += updated.length
      await this.persist()
      onBatch?.([...this.tracks.values()])
    }
  }

  async savePreferences(value: unknown): Promise<void> {
    this.preferences = cleanPreferences(value, [...this.tracks.values()])
    await this.persist()
  }

  async exportPlaylist(file: string, ids: unknown): Promise<void> {
    if (![".m3u", ".m3u8"].includes(path.extname(file).toLowerCase())) throw new Error("Use a extensão .m3u ou .m3u8.")
    const tracks = (Array.isArray(ids) ? ids as unknown[] : []).map((id) => typeof id === "string" ? this.tracks.get(id) : undefined).filter((track) => track !== undefined)
    const entries = tracks.map((track) => {
      if (track.source === "youtube") return track.path
      const relative = path.relative(path.dirname(file), track.path)
      // Prefix paths starting with # so they cannot be interpreted as comments.
      const location = relative.startsWith("#") ? `.${path.sep}${relative}` : relative
      if (/[\r\n]/.test(location)) throw new Error("Um nome de arquivo contém quebra de linha e não pode ser exportado em M3U.")
      return location
    })
    await fs.writeFile(file, ["#EXTM3U", ...entries, ""].join("\n"), "utf8")
  }

  async resolveTrack(id: string): Promise<string | null> {
    const track = this.tracks.get(id)
    if (!track || track.source === "youtube") return null
    if (await fs.realpath(track.path) !== track.path) return null
    return track.path
  }
}
