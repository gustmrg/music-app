import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import type { Track, YouTubeResolved } from "../shared/types.ts"

const execFileAsync = promisify(execFile)

export type YouTubeTarget = { kind: "video" | "playlist" | "channel-live"; id: string; url: string }
export type YouTubeVideo = { id: string; url: string; title: string; channel: string; isLive: boolean }
// What the library needs to store a video; the id is derived from the URL.
export type YouTubeVideoInput = Pick<YouTubeVideo, "url" | "title" | "channel" | "isLive">
export type YouTubeTrack = Track & { source: "youtube"; isLive: boolean }

// The subset of yt-dlp's JSON this module reads; everything is optional
// because it comes from an external program.
type VideoInfo = { id?: unknown; title?: unknown; fulltitle?: unknown; channel?: unknown; uploader?: unknown; live_status?: unknown; is_live?: unknown }
type PlaylistInfo = VideoInfo & { _type?: unknown; entries?: unknown }

// Accepts watch pages, youtu.be, Shorts, live and embed links, YouTube Music, and playlists.
export const VIDEO_PATTERN = /(?:youtube(?:-nocookie|music)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/i
export const PLAYLIST_PATTERN = /youtube(?:-nocookie|music)?\.com\/playlist\?(?:.*&)?list=([\w-]+)/i
export const LIST_PARAMETER = /[?&]list=([\w-]+)/i
// A channel's "/live" page points at whatever it is streaming right now:
// @handle, /channel/UC…, /c/name, and /user/name all have one.
export const CHANNEL_LIVE_PATTERN = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(@[^/?#\s]+|channel\/UC[\w-]{22}|c\/[^/?#\s]+|user\/[^/?#\s]+)\/live\/?(?:[?#]\S*)?$/i
export const MAX_PLAYLIST_ENTRIES = 500
// Lives have no audio-only format, so "bestaudio" alone would fall back to
// the 1080p HLS variant. Format 91 (144p) carries the same AAC audio with a
// fraction of the bandwidth; regular videos still get an audio-only format.
export const STREAM_FORMAT = "bestaudio/91/worst"

function canonicalVideoUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`
}

function canonicalPlaylistUrl(id: string) {
  return `https://www.youtube.com/playlist?list=${id}`
}

function canonicalChannelLiveUrl(channel: string) {
  return `https://www.youtube.com/${channel}/live`
}

export function matchYouTubeUrl(value: unknown): YouTubeTarget | null {
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
export function isLiveInfo(info: unknown): boolean {
  if (!info || typeof info !== "object") return false
  const { live_status, is_live } = info as VideoInfo
  if (typeof live_status === "string") return live_status === "is_live"
  return is_live === true
}

// yt-dlp appends the current date and time to a live's title; fulltitle
// keeps the title as the channel wrote it.
function videoTitle(info: VideoInfo) {
  return cleanTitle(info.fulltitle || info.title)
}

// Parses free-form user text into unique canonical YouTube targets.
export function parseYouTubeLinks(text: unknown): { targets: YouTubeTarget[]; invalid: number } {
  const targets = new Map<string, YouTubeTarget>()
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

function cleanTitle(value: unknown) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim().slice(0, 200)
}

// Flattens yt-dlp -J --flat-playlist output into { id, url, title, channel, isLive } entries.
export function parseMetadata(payload: string, limit = MAX_PLAYLIST_ENTRIES): { playlistTitle: string; videos: YouTubeVideo[] } {
  const json: PlaylistInfo | null = JSON.parse(payload)
  if (!json || typeof json !== "object") throw new Error("Resposta inesperada do yt-dlp.")
  if (json._type === "playlist" && Array.isArray(json.entries)) {
    const videos = (json.entries as (VideoInfo | null)[])
      .map((entry): YouTubeVideo | null => {
        if (!entry || typeof entry.id !== "string" || !/^[\w-]{11}$/.test(entry.id)) return null
        return {
          id: entry.id,
          url: canonicalVideoUrl(entry.id),
          title: videoTitle(entry) || "Vídeo do YouTube",
          channel: cleanTitle(entry.channel || entry.uploader || ""),
          isLive: isLiveInfo(entry),
        }
      })
      .filter((video) => video !== null)
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

type ExecError = Error & { code?: string; killed?: boolean; stderr?: string }

async function ytDlp(arguments_: string[]) {
  try {
    return await execFileAsync("yt-dlp", ["--no-warnings", "--no-progress", "--flat-playlist", ...arguments_], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 })
  } catch (caught) {
    const error = caught as ExecError
    if (error.code === "ENOENT") throw new Error("O yt-dlp não foi encontrado. Instale-o (por exemplo, pipx install yt-dlp ou baixe o binário) e reinicie o aplicativo.")
    if (error.killed) throw new Error("A leitura dos metadados do YouTube demorou demais e foi cancelada.")
    const details = String(error.stderr || error.message || "").split(/\r?\n/).filter((line) => line.startsWith("ERROR")).join(" ").trim()
    throw new Error(details || "Não foi possível ler os metadados deste link do YouTube.")
  }
}

// Expands a canonical video or playlist URL into video entries via yt-dlp.
export async function fetchVideos(target: YouTubeTarget) {
  const { stdout } = await ytDlp(["-J", target.url])
  return parseMetadata(stdout)
}

// Reads the two lines printed by resolveStream: live status, then stream URL.
export function parseResolved(stdout: unknown): YouTubeResolved {
  const lines = String(stdout ?? "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const url = lines.at(-1)
  if (!url || !/^https:\/\//.test(url)) throw new Error("Não foi possível obter o áudio deste vídeo. Ele pode ser privado, com restrição de idade ou indisponível.")
  return { url, isLive: lines.at(-2) === "is_live" }
}

// Resolves the stream URL for playback and whether the video is live right
// now. Googlevideo URLs expire after a few hours, so this must run at play
// time, not import time.
export async function resolveStream(url: string): Promise<YouTubeResolved> {
  const { stdout } = await ytDlp(["-f", STREAM_FORMAT, "--no-playlist", "--print", "%(live_status)s", "--print", "%(url)s", url])
  return parseResolved(stdout)
}

export function describeYouTube(url: string, title: unknown, channel: unknown, isLive: unknown = false): YouTubeTrack {
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

export function isYouTubeTrackPath(path: unknown): boolean {
  return /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(String(path))
}
