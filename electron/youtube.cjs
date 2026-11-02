const { execFile } = require("node:child_process")
const { promisify } = require("node:util")
const { createHash } = require("node:crypto")

const execFileAsync = promisify(execFile)

// Accepts watch pages, youtu.be shorts, YouTube Music, and playlists.
const VIDEO_PATTERN = /(?:youtube(?:-nocookie|music)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i
const PLAYLIST_PATTERN = /youtube(?:-nocookie|music)?\.com\/playlist\?(?:.*&)?list=([\w-]+)/i
const LIST_PARAMETER = /[?&]list=([\w-]+)/i
const MAX_PLAYLIST_ENTRIES = 500

function canonicalVideoUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`
}

function canonicalPlaylistUrl(id) {
  return `https://www.youtube.com/playlist?list=${id}`
}

function matchYouTubeUrl(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  const playlist = PLAYLIST_PATTERN.exec(trimmed)
  if (playlist) return { kind: "playlist", id: playlist[1], url: canonicalPlaylistUrl(playlist[1]) }
  const video = VIDEO_PATTERN.exec(trimmed)
  if (video) return { kind: "video", id: video[1], url: canonicalVideoUrl(video[1]) }
  return null
}

// Parses free-form user text into unique canonical YouTube targets.
function parseYouTubeLinks(text) {
  const targets = new Map()
  let invalid = 0
  for (const line of String(text ?? "").split(/\r?\n/)) {
    for (const token of line.split(/[;\s]+/)) {
      if (!token) continue
      const match = matchYouTubeUrl(token)
      if (!match) { invalid++; continue }
      if (!targets.has(match.url)) targets.set(match.url, match)
    }
  }
  return { targets: [...targets.values()], invalid }
}

function cleanTitle(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim().slice(0, 200)
}

// Flattens yt-dlp -J --flat-playlist output into { id, url, title, channel } entries.
function parseMetadata(payload, limit = MAX_PLAYLIST_ENTRIES) {
  const json = JSON.parse(payload)
  if (!json || typeof json !== "object") throw new Error("Resposta inesperada do yt-dlp.")
  if (json._type === "playlist" && Array.isArray(json.entries)) {
    const videos = json.entries
      .map((entry) => {
        if (!entry || typeof entry.id !== "string" || !/^[\w-]{11}$/.test(entry.id)) return null
        return {
          id: entry.id,
          url: canonicalVideoUrl(entry.id),
          title: cleanTitle(entry.title) || "Vídeo do YouTube",
          channel: cleanTitle(entry.channel || entry.uploader || ""),
        }
      })
      .filter(Boolean)
      .slice(0, limit)
    return { playlistTitle: cleanTitle(json.title), videos }
  }
  if (typeof json.id !== "string" || !/^[\w-]{11}$/.test(json.id)) throw new Error("O yt-dlp não retornou um vídeo válido para este link.")
  return {
    playlistTitle: "",
    videos: [{
      id: json.id,
      url: canonicalVideoUrl(json.id),
      title: cleanTitle(json.title) || "Vídeo do YouTube",
      channel: cleanTitle(json.channel || json.uploader || ""),
    }],
  }
}

async function ytDlp(arguments_) {
  try {
    return await execFileAsync("yt-dlp", ["--no-warnings", "--no-progress", "--flat-playlist", ...arguments_], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("O yt-dlp não foi encontrado. Instale-o (por exemplo, pipx install yt-dlp ou baixe o binário) e reinicie o aplicativo.")
    if (error.killed) throw new Error("A leitura dos metadados do YouTube demorou demais e foi cancelada.")
    const details = String(error.stderr || error.message || "").split(/\r?\n/).filter((line) => line.startsWith("ERROR")).join(" ").trim()
    throw new Error(details || "Não foi possível ler os metadados deste link do YouTube.")
  }
}

// Expands a canonical video or playlist URL into video entries via yt-dlp.
async function fetchVideos(target) {
  const { stdout } = await ytDlp(["-J", target.url])
  return parseMetadata(stdout)
}

// Resolves the direct audio stream URL for playback. Googlevideo URLs expire
// after a few hours, so this must run at play time, not import time.
async function resolveStream(url) {
  const { stdout } = await ytDlp(["-f", "bestaudio/best", "--no-playlist", "--print", "%(url)s", url])
  const stream = stdout.trim().split(/\r?\n/).filter(Boolean).pop()
  if (!stream || !/^https:\/\//.test(stream)) throw new Error("Não foi possível obter o áudio deste vídeo. Ele pode ser privado, com restrição de idade ou indisponível.")
  return stream
}

function describeYouTube(url, title, channel) {
  const path = canonicalVideoUrl(VIDEO_PATTERN.exec(url)?.[1] ?? url)
  return {
    id: createHash("sha256").update(path).digest("hex"),
    path,
    title: cleanTitle(title) || "Vídeo do YouTube",
    folder: cleanTitle(channel) || "YouTube",
    format: "YouTube",
    source: "youtube",
  }
}

function isYouTubeTrackPath(path) {
  return /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(String(path))
}

module.exports = {
  VIDEO_PATTERN,
  PLAYLIST_PATTERN,
  LIST_PARAMETER,
  MAX_PLAYLIST_ENTRIES,
  matchYouTubeUrl,
  parseYouTubeLinks,
  parseMetadata,
  fetchVideos,
  resolveStream,
  describeYouTube,
  isYouTubeTrackPath,
}
