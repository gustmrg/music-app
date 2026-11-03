import fs from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"

export const contentTypes: Record<string, string> = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac",
  ".ogg": "audio/ogg", ".opus": "audio/ogg", ".m4a": "audio/mp4",
  ".aac": "audio/aac", ".webm": "audio/webm",
}

// What the library resolves a track id to: a file on disk, or nothing.
export interface TrackFiles {
  resolveTrack(id: string): Promise<string | null>
}

// A track that exists only in memory, such as a file inside a torrent.
export interface VirtualTrack {
  length: number
  contentType: string
  stream(start: number, end: number): Readable
}

export interface VirtualTracks {
  resolveTrack(id: string): VirtualTrack | null
}

// Serve byte ranges explicitly: forwarding Range to net.fetch(file:) is not
// sufficient for seeking on all Electron versions. `torrents` optionally
// resolves virtual torrent track ids the same way the library resolves files.
export async function audioResponse(request: Request, library: TrackFiles, torrents?: VirtualTracks): Promise<Response> {
  let handle: FileHandle | undefined
  try {
    const url = new URL(request.url)
    if (url.hostname !== "track" || !/^\/[a-f0-9]{64}$/.test(url.pathname) || !["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 403 })
    const id = url.pathname.slice(1)
    let file: string | null = null
    let virtual: VirtualTrack | null = null
    try { file = await library.resolveTrack(id) } catch { file = null }
    if (!file && torrents) virtual = torrents.resolveTrack(id)
    if (!file && !virtual) return new Response(null, { status: 404 })
    let size: number
    let contentType: string
    if (file) {
      handle = await fs.open(file, "r")
      const stat = await handle.stat()
      if (!stat.isFile()) { await handle.close(); return new Response(null, { status: 404 }) }
      size = stat.size
      contentType = contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream"
    } else {
      size = virtual!.length
      contentType = virtual!.contentType
    }
    const headers: Record<string, string> = { "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "no-store" }
    const range = request.headers.get("range")
    let start = 0
    let end = size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
        end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
      } else start = size
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        if (handle) await handle.close()
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } })
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`
    }
    headers["Content-Length"] = String(Math.max(0, end - start + 1))
    const status = range ? 206 : 200
    if (request.method === "HEAD" || !size) { await handle?.close(); return new Response(null, { status, headers }) }
    const nodeStream: Readable = file ? handle!.createReadStream({ start, end }) : virtual!.stream(start, end)
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, { status, headers })
  } catch {
    if (handle) await handle.close().catch(() => {})
    return new Response(null, { status: 404 })
  }
}
