const { createHash } = require("node:crypto")
const { createWriteStream } = require("node:fs")
const fs = require("node:fs/promises")
const path = require("node:path")
const { pipeline } = require("node:stream/promises")
const { contentTypes } = require("./audio.cjs")

// webtorrent v3 is ESM-only; it is imported lazily so requiring this module
// (from tests or before first use) never touches the network or the bundle.
const METADATA_TIMEOUT_MS = 60_000
const EVICTION_GRACE_MS = 10_000
const PROGRESS_INTERVAL_MS = 1_000
// The btih parameter may come anywhere in the magnet query ("?dn=..&xt=..").
const MAGNET_PATTERN = /^magnet:\?(?:[^#]*?&)?xt=urn:btih:([a-z0-9]{32,40})(?:&|$)/i
const TORRENT_URL_PATTERN = /^https?:\/\/\S+\.torrent(\?|$)/i
const RESOLVE_TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5
const TORRENT_FILE_LIMIT = 10 * 1024 * 1024

const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "webm"]
const SEGMENT_LIMIT = 120
const MAX_SAVE_DEPTH = 4
const UNSAFE_SEGMENT = /[<>:"/\\|?*\u0000-\u001f\u007f]/g
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i

function isAudioName(name) {
  return AUDIO_EXTENSIONS.includes(path.extname(name).slice(1).toLowerCase())
}

// Torrent paths are untrusted: each segment is rewritten so it can neither
// climb out of the save folder nor produce names Windows or macOS reject.
function safeSegment(value, keepExtension = false) {
  const text = String(value ?? "").replace(UNSAFE_SEGMENT, "_").trim()
  const candidate = keepExtension ? path.extname(text) : ""
  const extension = candidate.length <= 16 ? candidate : ""
  let base = extension ? text.slice(0, -extension.length) : text
  base = base.replace(/^[. ]+/, "").slice(0, SEGMENT_LIMIT - extension.length).replace(/[. ]+$/, "")
  if (!base) return ""
  return `${RESERVED_NAME.test(base) ? `_${base}` : base}${extension}`
}

// Maps a webtorrent file path ("Torrent Name/CD1/01 - Track.flac") to its
// place inside the save folder, keeping the torrent folder and the deepest
// subfolders so very nested releases stay under OS path limits.
function savePath(root, filePath) {
  const parts = String(filePath ?? "").split(/[\\/]+/)
  const segments = parts.map((part, index) => safeSegment(part, index === parts.length - 1)).filter(Boolean)
  if (!segments.length || !isAudioName(segments[segments.length - 1])) throw new Error("O torrent contém um nome de arquivo inválido.")
  const kept = segments.length > MAX_SAVE_DEPTH ? [segments[0], ...segments.slice(-(MAX_SAVE_DEPTH - 1))] : segments
  const base = path.resolve(root)
  const destination = path.resolve(base, ...kept)
  const relative = path.relative(base, destination)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("O torrent contém um nome de arquivo inválido.")
  return destination
}

// Reuses an identical earlier save (same size) and never overwrites a
// different file: "Track.flac", then "Track (2).flac", "Track (3).flac"...
async function availablePath(destination, length) {
  const extension = path.extname(destination)
  const base = extension ? destination.slice(0, -extension.length) : destination
  for (let attempt = 1; attempt <= 99; attempt++) {
    const candidate = attempt === 1 ? destination : `${base} (${attempt})${extension}`
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile() && stat.size === length) return { path: candidate, exists: true }
    } catch (error) {
      if (error.code === "ENOENT") return { path: candidate, exists: false }
      throw error
    }
  }
  throw new Error("Já existem cópias demais deste arquivo na pasta de músicas salvas.")
}

function isHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol) } catch { return false }
}

// Magnets and direct .torrent links are always accepted; other HTTP links
// (indexer download proxies) only when `allowUrl` vouches for their origin.
function isSupportedSource(source, allowUrl = () => false) {
  if (typeof source !== "string") return false
  return MAGNET_PATTERN.test(source) || TORRENT_URL_PATTERN.test(source) || (isHttpUrl(source) && allowUrl(source) === true)
}

async function readLimited(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) throw new Error("O arquivo .torrent entregue pelo indexador é grande demais.")
  const chunks = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength
    if (size > limit) throw new Error("O arquivo .torrent entregue pelo indexador é grande demais.")
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// Indexer download links answer with a redirect to a magnet, a redirect to
// the tracker's .torrent, the .torrent bytes, or (rarely) a magnet as text.
async function resolveSource(source) {
  if (MAGNET_PATTERN.test(source)) return source
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)
  try {
    let url = source
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let response
      try { response = await fetch(url, { redirect: "manual", signal: controller.signal }) } catch (error) {
        throw new Error(error?.name === "AbortError" ? "O indexador demorou demais para entregar o torrent." : "Não foi possível baixar o torrent pelo indexador. Verifique se ele está em execução.")
      }
      if (response.status >= 300 && response.status < 400) {
        const location = (response.headers.get("location") ?? "").trim()
        if (/^magnet:/i.test(location)) {
          if (!MAGNET_PATTERN.test(location)) throw new Error("O indexador redirecionou para um magnet inválido.")
          return location
        }
        let next = ""
        try { next = new URL(location, url).toString() } catch { /* invalid */ }
        if (!isHttpUrl(next)) throw new Error("O indexador redirecionou para um endereço não suportado.")
        url = next
        continue
      }
      if (!response.ok) throw new Error(`O indexador não entregou o torrent (código ${response.status}). O resultado pode ter expirado; busque de novo.`)
      const body = await readLimited(response, TORRENT_FILE_LIMIT)
      const text = body.subarray(0, 7).toString("latin1")
      if (text.toLowerCase() === "magnet:") {
        const magnet = body.toString("utf8").trim()
        if (MAGNET_PATTERN.test(magnet)) return magnet
      }
      // A bencoded .torrent always starts with a dictionary ("d").
      if (body[0] !== 0x64) throw new Error("O indexador não devolveu um arquivo .torrent válido.")
      return body
    }
    throw new Error("O indexador redirecionou vezes demais ao entregar o torrent.")
  } finally {
    clearTimeout(timeout)
  }
}

// RFC 4648 base32 decoder (Node has no Buffer base32 support). Info hashes
// arrive as 32-char base32 or 40-char hex; both normalize to 40-char hex.
function decodeBase32(value) {
  let bits = 0
  let buffer = 0
  const bytes = []
  for (const char of String(value).toUpperCase()) {
    if (char === "=") continue
    const code = char.charCodeAt(0)
    const digit = code >= 65 && code <= 90 ? code - 65 : code >= 50 && code <= 55 ? code - 24 : -1
    if (digit < 0) return null
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return Buffer.from(bytes).toString("hex")
}

// Magnets carry either a 40-char hex or a 32-char base32 info hash; the hex
// form is used as the deduplication key across magnet variants.
function normalizeInfoHash(source) {
  const raw = MAGNET_PATTERN.exec(source)?.[1]
  if (!raw) return null
  const value = raw.toLowerCase()
  if (value.length === 40) return /^[0-9a-f]+$/.test(value) ? value : null
  const decoded = decodeBase32(raw)
  return decoded && decoded.length === 40 ? decoded : null
}

function torrentTrackId(infoHash, fileIndex) {
  return createHash("sha256").update(`torrent:${infoHash}:${fileIndex}`).digest("hex")
}

// Picks the default track: the largest audio file in the torrent.
function defaultFileIndex(files) {
  let best = -1
  for (let index = 0; index < files.length; index++) {
    if (!isAudioName(files[index].name)) continue
    if (best === -1 || files[index].length > files[best].length) best = index
  }
  return best
}

class TorrentEngine {
  constructor({ cachePath, allowUrl = () => false }) {
    this.cachePath = cachePath
    this.allowUrl = allowUrl
    this.client = null
    this.torrents = new Map() // infoHash hex -> torrent
    this.sourceKeys = new Map() // source string -> infoHash hex, learned on first add
    this.adding = new Map() // source string -> in-flight add promise
    this.tracks = new Map() // virtual track id -> { torrent, file }
    this.lastUsedAt = new Map() // infoHash hex -> timestamp
    this.saves = new Map() // infoHash hex -> pending save job
    this.onProgress = null
    this.onSaved = null
    this.sweeper = null
  }

  async ensureClient() {
    if (this.client) return this.client
    const { default: WebTorrent } = await import("webtorrent")
    // TCP peers only: native uTP/WebRTC modules are not rebuilt for Electron,
    // and tracker + DHT discovery covers the public swarms we stream from.
    this.client = new WebTorrent({ utp: false, tracker: true, dht: true, lsd: true })
    this.client.on("error", () => {}) // per-torrent errors surface on the torrent itself
    return this.client
  }

  // Stream-only posture: the cache never survives a restart.
  async resetCache() {
    await fs.rm(this.cachePath, { recursive: true, force: true })
    await fs.mkdir(this.cachePath, { recursive: true })
  }

  liveTorrent(key) {
    const torrent = key ? this.torrents.get(key) : null
    return torrent && !torrent.destroyed ? torrent : null
  }

  // The same source always maps to one torrent: magnets dedupe by info hash,
  // download links by the hash learned on their first add, and concurrent
  // adds of one source share a single request.
  async addTorrent(source) {
    if (!isSupportedSource(source, this.allowUrl)) throw new Error("Fonte de torrent não suportada; use um magnet, um link .torrent ou um link do indexador configurado.")
    const known = this.liveTorrent(this.sourceKeys.get(source) ?? normalizeInfoHash(source))
    if (known) return known
    let adding = this.adding.get(source)
    if (!adding) {
      adding = this.openTorrent(source).finally(() => this.adding.delete(source))
      this.adding.set(source, adding)
    }
    return adding
  }

  async openTorrent(source) {
    const input = await resolveSource(source)
    const resolvedKey = typeof input === "string" ? normalizeInfoHash(input) : null
    const resolved = this.liveTorrent(resolvedKey)
    if (resolved) {
      this.sourceKeys.set(source, resolvedKey)
      return resolved
    }
    const client = await this.ensureClient()
    const torrent = await new Promise((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        added.destroy(() => reject(new Error("Os metadados do torrent não chegaram a tempo. Tente novamente ou escolha outro resultado.")))
      }, METADATA_TIMEOUT_MS)
      const added = client.add(input, { path: this.cachePath }, (ready) => {
        clearTimeout(timeout)
        if (settled) return
        settled = true
        resolve(ready)
      })
      added.once("error", (error) => {
        clearTimeout(timeout)
        if (settled) return
        settled = true
        // A .torrent for a torrent already open (reached through another
        // link) is a duplicate for webtorrent: reuse the open one.
        const twin = this.liveTorrent(added.infoHash)
        if (twin) resolve(twin)
        else reject(new Error(`Não foi possível abrir o torrent: ${error.message || error}`))
      })
    })
    const torrentKey = torrent.infoHash
    this.sourceKeys.set(source, torrentKey)
    this.torrents.set(torrentKey, torrent)
    this.touch(torrentKey)
    this.startSweeper()
    return torrent
  }

  describe(torrent) {
    return {
      infoHash: torrent.infoHash,
      name: torrent.name,
      files: torrent.files.map((file, index) => ({ index, name: file.name, length: file.length, isAudio: isAudioName(file.name) })),
    }
  }

  async expand(source) {
    return this.describe(await this.addTorrent(source))
  }

  // Registers a virtual track id that audio.cjs can serve byte ranges for.
  async prepare(source, fileIndex) {
    const torrent = await this.addTorrent(source)
    const file = torrent.files[Number(fileIndex)]
    if (!file || !isAudioName(file.name)) throw new Error("Este arquivo do torrent não é um áudio compatível.")
    const id = torrentTrackId(torrent.infoHash, fileIndex)
    this.tracks.set(id, { torrent, file })
    this.touch(torrent.infoHash)
    this.retainOnly(torrent)
    return { id, infoHash: torrent.infoHash, name: torrent.name, fileName: file.name, length: file.length }
  }

  resolveTrack(id) {
    const entry = this.tracks.get(id)
    if (!entry || entry.torrent.destroyed) return null
    const extension = path.extname(entry.file.name).toLowerCase()
    return {
      length: entry.file.length,
      contentType: contentTypes[extension] || "application/octet-stream",
      stream: (start, end) => entry.file.createReadStream({ start, end }),
    }
  }

  release(id) {
    this.tracks.delete(id)
  }

  // Saving pins the torrent until every requested file is complete and
  // copied into the save folder; streaming the same torrent keeps working.
  async save(source, fileIndexes, root) {
    return this.startSave(await this.addTorrent(source), fileIndexes, root)
  }

  saveTrack(id, root) {
    const entry = this.tracks.get(id)
    if (!entry || entry.torrent.destroyed) throw new Error("Esta música não está mais ativa no torrent. Toque-a de novo para salvar.")
    return this.startSave(entry.torrent, [entry.torrent.files.indexOf(entry.file)], root)
  }

  startSave(torrent, fileIndexes, root) {
    if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error("Escolha uma pasta válida para salvar as músicas.")
    const requested = []
    for (const value of new Set(Array.isArray(fileIndexes) ? fileIndexes : [])) {
      const index = Number(value)
      const file = Number.isInteger(index) ? torrent.files[index] : undefined
      if (!file || !isAudioName(file.name)) continue
      try { requested.push({ index, file, destination: savePath(root, file.path) }) } catch { /* unsafe name: skip */ }
    }
    if (!requested.length) throw new Error("Nenhum arquivo de áudio compatível foi selecionado para salvar.")
    let job = this.saves.get(torrent.infoHash)
    if (!job) {
      job = { torrent, name: torrent.name, requested: new Map(), pending: new Map(), saved: [], failed: 0, finished: false }
      this.saves.set(torrent.infoHash, job)
    }
    let queued = 0
    for (const entry of requested) {
      if (job.pending.has(entry.index)) continue
      job.requested.set(entry.index, entry.file)
      job.pending.set(entry.index, entry)
      queued++
      if (entry.file.done) void this.copySaved(job, entry.index)
      else entry.file.once("done", () => { void this.copySaved(job, entry.index) })
    }
    this.touch(torrent.infoHash)
    this.startSweeper()
    return { infoHash: torrent.infoHash, name: torrent.name, queued, pending: job.pending.size }
  }

  async copySaved(job, index) {
    const entry = job.pending.get(index)
    if (!entry || entry.copying || job.finished) return
    entry.copying = true
    let temporary = ""
    try {
      await fs.mkdir(path.dirname(entry.destination), { recursive: true })
      const target = await availablePath(entry.destination, entry.file.length)
      if (!target.exists) {
        temporary = `${target.path}.part`
        await pipeline(entry.file.createReadStream(), createWriteStream(temporary))
        await fs.rename(temporary, target.path)
        temporary = ""
      }
      job.saved.push(target.path)
    } catch {
      job.failed++
      if (temporary) await fs.rm(temporary, { force: true }).catch(() => {})
    } finally {
      job.pending.delete(index)
    }
    if (!job.pending.size) this.finishSave(job, false)
  }

  // Reports once per job; cancelled jobs count their unfinished files as failed.
  finishSave(job, cancelled) {
    if (job.finished) return
    job.finished = true
    const key = job.torrent.infoHash
    if (this.saves.get(key) === job) this.saves.delete(key)
    this.touch(key)
    const outcome = { infoHash: key, name: job.name, paths: [...job.saved], failed: job.failed + (cancelled ? job.pending.size : 0), cancelled }
    try { this.onSaved?.(outcome) } catch { /* listener errors must not break the engine */ }
  }

  saveProgress(job) {
    if (!job) return undefined
    let total = 0
    let downloaded = 0
    for (const file of job.requested.values()) {
      total += file.length
      downloaded += Math.min(file.length, file.downloaded)
    }
    return { files: job.requested.size, done: job.saved.length, progress: total ? downloaded / total : 0 }
  }

  touch(infoHash) {
    this.lastUsedAt.set(infoHash, Date.now())
  }

  // Single-active-torrent policy: preparing a track from a new torrent drops
  // every track registered on other torrents and destroys them (plus their
  // cached data) — the stream-only posture from the playback policy issue.
  // Torrents with a pending save are pinned and survive this policy.
  retainOnly(keep) {
    for (const [key, torrent] of [...this.torrents]) {
      if (torrent === keep || torrent.destroyed || this.saves.has(key)) continue
      this.destroyTorrent(key, torrent)
    }
  }

  destroyTorrent(key, torrent) {
    const job = this.saves.get(key)
    if (job) this.finishSave(job, true)
    for (const [source, value] of this.sourceKeys) if (value === key) this.sourceKeys.delete(source)
    this.torrents.delete(key)
    this.lastUsedAt.delete(key)
    for (const [id, entry] of this.tracks) if (entry.torrent === torrent) this.tracks.delete(id)
    if (!torrent.destroyed) torrent.destroy()
    // webtorrent writes each torrent into a folder named after the torrent.
    const directory = path.join(this.cachePath, torrent.name)
    fs.rm(directory, { recursive: true, force: true }).catch(() => {})
  }

  // The sweeper drops torrents that stopped being referenced (track skipped,
  // queue cleared) instead of seeding forever — the stream-only policy.
  startSweeper() {
    if (this.sweeper) return
    this.sweeper = setInterval(() => {
      const now = Date.now()
      for (const [key, torrent] of this.torrents) {
        if (torrent.destroyed) continue
        const inUse = [...this.tracks.values()].some((entry) => entry.torrent === torrent)
        const idle = now - (this.lastUsedAt.get(key) ?? now)
        if (!inUse && !this.saves.has(key) && idle > EVICTION_GRACE_MS) this.destroyTorrent(key, torrent)
      }
      if (this.onProgress) {
        this.onProgress([...this.torrents.values()].filter((torrent) => !torrent.destroyed).map((torrent) => ({
          infoHash: torrent.infoHash,
          name: torrent.name,
          progress: torrent.progress,
          peers: torrent.numPeers,
          speed: torrent.downloadSpeed,
          saving: this.saveProgress(this.saves.get(torrent.infoHash)),
        })))
      }
      if (!this.torrents.size) this.stopSweeper()
    }, PROGRESS_INTERVAL_MS)
    this.sweeper.unref?.()
  }

  stopSweeper() {
    if (!this.sweeper) return
    clearInterval(this.sweeper)
    this.sweeper = null
  }

  // Streams are always stopped; pinned saves only when explicitly asked, so
  // the stream-only policy (leaving a torrent track) never cancels a save.
  async stopAll({ includeSaves = false } = {}) {
    for (const [key, torrent] of [...this.torrents]) {
      if (!includeSaves && this.saves.has(key)) continue
      this.destroyTorrent(key, torrent)
    }
    if (!this.torrents.size) {
      this.tracks.clear()
      await this.resetCache()
    }
  }

  async destroy() {
    this.stopSweeper()
    await this.stopAll({ includeSaves: true })
    if (this.client) await new Promise((resolve) => this.client.destroy(() => resolve()))
    this.client = null
  }
}

module.exports = { TorrentEngine, isAudioName, isSupportedSource, normalizeInfoHash, torrentTrackId, defaultFileIndex, decodeBase32, safeSegment, savePath, availablePath, resolveSource }
