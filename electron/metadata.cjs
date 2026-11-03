const fs = require("node:fs/promises")
const path = require("node:path")
const { createHash } = require("node:crypto")

// Embedded tags (ID3, Vorbis comments, MP4 atoms…) read with music-metadata.
// Tags are read once at import and cached in the library file; covers are
// stored by content hash so an album shares a single image on disk.
const TEXT_LIMIT = 200
const COVER_EXTENSIONS = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }
const COVER_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }
const COVER_NAME = /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/
const MAX_COVER_BYTES = 10 * 1024 * 1024
// title replaces the file-name title when the file has one.
const TEXT_FIELDS = ["title", "artist", "albumArtist", "album", "genre"]
// Fields a user may override inside the app without touching the file.
const EDITABLE_FIELDS = ["artist", "albumArtist", "album", "genre", "year"]

let parser
// music-metadata is ESM-only; the main process is CommonJS.
const loadParser = () => (parser ??= import("music-metadata"))

const cleanText = (value) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, TEXT_LIMIT) : ""
const cleanInteger = (value, max) => Number.isInteger(value) && value > 0 && value <= max ? value : 0
const cleanYear = (value) => cleanInteger(typeof value === "string" ? Number(value) : value, 9999)

// Keeps only known, valid tag fields; empty values are omitted.
function cleanTags(value) {
  const tags = {}
  for (const field of TEXT_FIELDS) {
    const text = cleanText(value?.[field])
    if (text) tags[field] = text
  }
  const year = cleanYear(value?.year)
  if (year) tags.year = year
  const trackNo = cleanInteger(value?.trackNo, 9999)
  if (trackNo) tags.trackNo = trackNo
  const discNo = cleanInteger(value?.discNo, 999)
  if (discNo) tags.discNo = discNo
  if (Number.isFinite(value?.duration) && value.duration > 0 && value.duration < 86_400) tags.duration = Math.round(value.duration * 10) / 10
  if (typeof value?.cover === "string" && COVER_NAME.test(value.cover)) tags.cover = value.cover
  return tags
}

// In-app overrides: an empty string clears the field, so it is kept.
function cleanTagEdit(value) {
  const edit = {}
  for (const field of EDITABLE_FIELDS) {
    if (value?.[field] === undefined) continue
    if (field === "year") {
      const year = value.year === "" || value.year === 0 ? 0 : cleanYear(value.year)
      if (year || value.year === "" || value.year === 0) edit.year = year
    } else if (typeof value[field] === "string") edit[field] = cleanText(value[field])
  }
  return edit
}

async function storeCover(picture, coversDir) {
  const extension = COVER_EXTENSIONS[String(picture?.format ?? "").toLowerCase()]
  const data = picture?.data
  if (!coversDir || !extension || !data?.length || data.length > MAX_COVER_BYTES) return ""
  const name = `${createHash("sha256").update(data).digest("hex")}.${extension}`
  try {
    await fs.mkdir(coversDir, { recursive: true })
    await fs.writeFile(path.join(coversDir, name), data, { flag: "wx" })
  } catch (error) { if (error.code !== "EEXIST") return "" }
  return name
}

async function readTags(file, coversDir) {
  const { parseFile, selectCover } = await loadParser()
  const { common, format } = await parseFile(file, { duration: false, skipCovers: !coversDir })
  const cover = coversDir ? await storeCover(selectCover(common.picture), coversDir) : ""
  return cleanTags({
    title: common.title,
    artist: common.artist ?? common.artists?.join(", "),
    albumArtist: common.albumartist,
    album: common.album,
    genre: common.genre?.[0],
    year: common.year,
    trackNo: common.track?.no ?? 0,
    discNo: common.disk?.no ?? 0,
    duration: format.duration,
    cover,
  })
}

// Runs `worker` over items with bounded concurrency, preserving order.
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const run = async () => { while (next < items.length) { const index = next++; results[index] = await worker(items[index], index) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

async function coverResponse(url, coversDir) {
  const name = url.pathname.slice(1)
  if (!COVER_NAME.test(name) || !coversDir) return new Response(null, { status: 404 })
  try {
    const data = await fs.readFile(path.join(coversDir, name))
    return new Response(data, { headers: { "Content-Type": COVER_TYPES[name.split(".").pop()], "Cache-Control": "max-age=31536000, immutable" } })
  } catch { return new Response(null, { status: 404 }) }
}

module.exports = { readTags, cleanTags, cleanTagEdit, mapLimit, coverResponse, EDITABLE_FIELDS }
