const fs = require("node:fs/promises")
const path = require("node:path")
const { createHash, randomUUID } = require("node:crypto")
const { fileURLToPath } = require("node:url")
const { describeYouTube, isYouTubeTrackPath } = require("./youtube.cjs")
const { cleanDiscoverSettings } = require("./discover.cjs")

const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "webm"]
const isAudio = (file) => AUDIO_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase())
const isLocal = (file) => typeof file === "string" && !/^[a-z][a-z\d+.-]*:/i.test(file.replace(/^[a-z]:[\\/]/i, "")) && !/^[\\/]{2}/.test(file)

function playlistPaths(text, playlistFile) {
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

function cleanPreferences(value, tracks) {
  const ids = new Set(tracks.map((track) => track.id))
  const references = (items) => Array.isArray(items) ? [...new Set(items.filter((id) => ids.has(id)))] : []
  const playlistIds = new Set()
  return {
    liked: references(value?.liked),
    recent: references(value?.recent).slice(0, 100),
    volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : 0.7,
    discover: cleanDiscoverSettings(value?.discover),
    playlists: (Array.isArray(value?.playlists) ? value.playlists : []).filter((item) => {
      if (!item || typeof item.id !== "string" || playlistIds.has(item.id) || typeof item.name !== "string" || !item.name.trim()) return false
      playlistIds.add(item.id)
      return true
    }).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 120), trackIds: references(item.trackIds) })),
  }
}

// The save folder is chosen through a main-process dialog only, so it lives
// outside the preferences the renderer can overwrite.
const cleanSaveFolder = (value) => typeof value === "string" && path.isAbsolute(value) && isLocal(value) ? value : ""

class LocalLibrary {
  constructor(storeFile, { defaultSaveFolder = "" } = {}) {
    this.storeFile = storeFile
    this.defaultSaveFolder = defaultSaveFolder
    this.saveFolder = ""
    this.tracks = new Map()
    this.preferences = cleanPreferences({}, [])
    this.writes = Promise.resolve()
  }

  async load() {
    let saved
    try { saved = JSON.parse(await fs.readFile(this.storeFile, "utf8")) }
    catch (error) { if (error.code === "ENOENT") return this.snapshot(); throw error }
    if (saved.version !== 1 || !Array.isArray(saved.tracks)) throw new Error("Biblioteca local inválida; o arquivo salvo foi preservado.")
    for (const track of saved.tracks) {
      if (track?.source === "youtube" && isYouTubeTrackPath(track.path)) {
        const item = describeYouTube(track.path, track.title, track.folder)
        this.tracks.set(item.id, item)
      } else if (track && typeof track.path === "string" && path.isAbsolute(track.path) && isLocal(track.path) && isAudio(track.path)) {
        const item = this.describe(track.path)
        this.tracks.set(item.id, item)
      }
    }
    this.preferences = cleanPreferences(saved, [...this.tracks.values()])
    this.saveFolder = cleanSaveFolder(saved.saveFolder)
    return this.snapshot()
  }

  describe(file) {
    return {
      id: createHash("sha256").update(file).digest("hex"),
      path: file,
      title: path.basename(file, path.extname(file)),
      folder: path.dirname(file),
      format: path.extname(file).slice(1).toUpperCase(),
    }
  }

  snapshot() { return { tracks: [...this.tracks.values()], ...this.preferences, saveFolder: this.saveFolderPath() } }

  saveFolderPath() { return this.saveFolder || this.defaultSaveFolder }

  async setSaveFolder(folder) {
    const clean = cleanSaveFolder(folder)
    if (!clean) throw new Error("Escolha uma pasta local para salvar as músicas.")
    this.saveFolder = clean
    await this.persist()
    return clean
  }

  async persist() {
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

  async addFiles(files) {
    const imported = []
    let skipped = 0
    for (const file of files) {
      try {
        if (!isLocal(file) || !isAudio(file)) { skipped++; continue }
        const canonical = await fs.realpath(file)
        if (!isLocal(canonical) || !isAudio(canonical) || !(await fs.stat(canonical)).isFile()) { skipped++; continue }
        const track = this.describe(canonical)
        this.tracks.set(track.id, track)
        imported.push(track.id)
      } catch { skipped++ }
    }
    await this.persist()
    return { tracks: [...this.tracks.values()], imported: [...new Set(imported)], skipped }
  }

  async addFolder(folder) {
    const files = []
    let skipped = 0
    const walk = async (directory) => {
      let entries
      try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { skipped++; return }
      for (const entry of entries) {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) await walk(file)
        else if (entry.isFile() && isAudio(file)) files.push(file)
      }
    }
    await walk(folder)
    files.sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    const result = await this.addFiles(files)
    return { ...result, skipped: result.skipped + skipped }
  }

  async importPlaylist(file) {
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

  async addVideos(videos, playlistName = "") {
    const imported = []
    for (const video of videos) {
      if (!video || !isYouTubeTrackPath(video.url)) continue
      const track = describeYouTube(video.url, video.title, video.channel)
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

  async savePreferences(value) {
    this.preferences = cleanPreferences(value, [...this.tracks.values()])
    await this.persist()
  }

  async exportPlaylist(file, ids) {
    if (![".m3u", ".m3u8"].includes(path.extname(file).toLowerCase())) throw new Error("Use a extensão .m3u ou .m3u8.")
    const tracks = (Array.isArray(ids) ? ids : []).map((id) => this.tracks.get(id)).filter(Boolean)
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

  async resolveTrack(id) {
    const track = this.tracks.get(id)
    if (!track || track.source === "youtube") return null
    if (await fs.realpath(track.path) !== track.path) return null
    return track.path
  }
}

module.exports = { LocalLibrary, AUDIO_EXTENSIONS, playlistPaths, cleanPreferences }
