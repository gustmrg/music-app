const fs = require("node:fs/promises")
const path = require("node:path")
const { Readable } = require("node:stream")

const contentTypes = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac",
  ".ogg": "audio/ogg", ".opus": "audio/ogg", ".m4a": "audio/mp4",
  ".aac": "audio/aac", ".webm": "audio/webm",
}

// Serve byte ranges explicitly: forwarding Range to net.fetch(file:) is not
// sufficient for seeking on all Electron versions.
async function audioResponse(request, library) {
  let handle
  try {
    const url = new URL(request.url)
    if (url.hostname !== "track" || !/^\/[a-f0-9]{64}$/.test(url.pathname) || !["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 403 })
    const file = await library.resolveTrack(url.pathname.slice(1))
    if (!file) return new Response(null, { status: 404 })
    handle = await fs.open(file, "r")
    const stat = await handle.stat()
    if (!stat.isFile()) { await handle.close(); return new Response(null, { status: 404 }) }
    const headers = { "Content-Type": contentTypes[path.extname(file).toLowerCase()] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" }
    const range = request.headers.get("range")
    let start = 0
    let end = stat.size - 1
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (match && (match[1] || match[2])) {
        start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]))
        end = match[1] && match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1
      } else start = stat.size
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
        await handle.close()
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${stat.size}` } })
      }
      headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`
    }
    headers["Content-Length"] = String(Math.max(0, end - start + 1))
    const status = range ? 206 : 200
    if (request.method === "HEAD" || !stat.size) { await handle.close(); return new Response(null, { status, headers }) }
    return new Response(Readable.toWeb(handle.createReadStream({ start, end })), { status, headers })
  } catch {
    if (handle) await handle.close().catch(() => {})
    return new Response(null, { status: 404 })
  }
}

module.exports = { audioResponse }
