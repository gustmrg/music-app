const { execFile } = require("node:child_process")
const { promisify } = require("node:util")
const { createHash } = require("node:crypto")

const execFileAsync = promisify(execFile)

// Accepts watch pages, youtu.be, Shorts, live and embed links, YouTube Music, and playlists.
const VIDEO_PATTERN = /(?:youtube(?:-nocookie|music)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i
const PLAYLIST_PATTERN = /youtube(?:-nocookie|music)?\.com\/playlist\?(?:.*&)?list=([\w-]+)/i
const LIST_PARAMETER = /[?&]list=([\w-]+)/i
// A channel's "/live" page points at whatever it is streaming right now:
// @handle, /channel/UC…, /c/name, and /user/name all have one.
const CHANNEL_LIVE_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(@[^/?#\s]+|channel\/UC[\w-]{22}|c\/[^/?#\s]+|user\/[^/?#\s]+)\/live\/?(?:[?#]\S*)?$/i
const MAX_PLAYLIST_ENTRIES = 500
// Lives have no audio-only format, so "bestaudio" alone would fall back to
// the 1080p HLS variant. Format 91 (144p) carries the same AAC audio with a
// fraction of the bandwidth; regular videos still get an audio-only format.
const STREAM_FORMAT = "bestaudio/91/worst"

function canonicalVideoUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`
}

function canonicalPlaylistUrl(id) {
  return `https://www.youtube.com/playlist?list=${id}`
}

function canonicalChannelLiveUrl(channel) {
  return `https://www.youtube.com/${channel}/live`
}

function matchYouTubeUrl(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  const playlist = PLAYLIST_PATTERN.exec(trimmed)
  if (playlist) return { kind: "playlist", id: playlist[1], url: canonicalPlaylistUrl(playlist[1]) }
  const video = VIDEO_PATTERN.exec(trimmed)
  if (video) return { kind: "video", id: video[1], url: canonicalVideoUrl(video[1]) }
  const channel = CHANNEL_LIVE_PATTERN.exec(trimmed)
  if (channel) return { kind: "channel-live", id: channel[1], url: canonicalChannelLiveUrl(channel[1]) }
  return null
}

// yt-dlp reports "is_live", "is_upcoming", "was_live", "post_live", or
// "not_live"; older or flat entries may only carry the is_live boolean.
// Scheduled and ended streams are not live: they become live (or a regular
// recording) later, and resolving at play time picks that up.
function isLiveInfo(info) {
  if (!info || typeof info !== "object") return false
  if (typeof info.live_status === "string") return info.live_status === "is_live"
  return info.is_live === true
}

// yt-dlp appends the current date and time to a live's title; fulltitle
// keeps the title as the channel wrote it.
function videoTitle(info) {
  return cleanTitle(info.fulltitle || info.title)
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

// Flattens yt-dlp -J --flat-playlist output into { id, url, title, channel, isLive } entries.
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
          title: videoTitle(entry) || "Vídeo do YouTube",
          channel: cleanTitle(entry.channel || entry.uploader || ""),
          isLive: isLiveInfo(entry),
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
      title: videoTitle(json) || "Vídeo do YouTube",
      channel: cleanTitle(json.channel || json.uploader || ""),
      isLive: isLiveInfo(json),
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

// Reads the two lines printed by resolveStream: live status, then stream URL.
function parseResolved(stdout) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const url = lines.at(-1)
  if (!url || !/^https:\/\//.test(url)) throw new Error("Não foi possível obter o áudio deste vídeo. Ele pode ser privado, com restrição de idade ou indisponível.")
  return { url, isLive: lines.at(-2) === "is_live" }
}

// Resolves the stream URL for playback and whether the video is live right
// now. Googlevideo URLs expire after a few hours, so this must run at play
// time, not import time.
async function resolveStream(url) {
  const { stdout } = await ytDlp(["-f", STREAM_FORMAT, "--no-playlist", "--print", "%(live_status)s", "--print", "%(url)s", url])
  return parseResolved(stdout)
}

function describeYouTube(url, title, channel, isLive = false) {
  const path = canonicalVideoUrl(VIDEO_PATTERN.exec(url)?.[1] ?? url)
  return {
    id: createHash("sha256").update(path).digest("hex"),
    path,
    title: cleanTitle(title) || "Vídeo do YouTube",
    folder: cleanTitle(channel) || "YouTube",
    format: "YouTube",
    source: "youtube",
    isLive: isLive === true,
  }
}

function isYouTubeTrackPath(path) {
  return /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(String(path))
}

module.exports = {
  VIDEO_PATTERN,
  PLAYLIST_PATTERN,
  LIST_PARAMETER,
  CHANNEL_LIVE_PATTERN,
  MAX_PLAYLIST_ENTRIES,
  STREAM_FORMAT,
  matchYouTubeUrl,
  parseYouTubeLinks,
  parseMetadata,
  parseResolved,
  isLiveInfo,
  fetchVideos,
  resolveStream,
  describeYouTube,
  isYouTubeTrackPath,
}
