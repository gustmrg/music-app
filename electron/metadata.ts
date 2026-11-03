import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import type { IPicture } from "music-metadata"
import type { TagEdit, TrackTags } from "../shared/types.ts"

// Tags read from a file; title replaces the file-name title when present.
export type FileTags = TrackTags & { title?: string }
type TextField = "title" | "artist" | "albumArtist" | "album" | "genre"
type EditableField = keyof TagEdit

// Embedded tags (ID3, Vorbis comments, MP4 atoms…) read with music-metadata.
// Tags are read once at import and cached in the library file; covers are
// stored by content hash so an album shares a single image on disk.
const TEXT_LIMIT = 200
const COVER_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }
const COVER_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }
const COVER_NAME = /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/
const MAX_COVER_BYTES = 10 * 1024 * 1024
// title replaces the file-name title when the file has one.
const TEXT_FIELDS: TextField[] = ["title", "artist", "albumArtist", "album", "genre"]
// Fields a user may override inside the app without touching the file.
export const EDITABLE_FIELDS: EditableField[] = ["artist", "albumArtist", "album", "genre", "year"]

let parser: Promise<typeof import("music-metadata")> | undefined
// music-metadata is ESM-only and the bundled main process is CommonJS, so it
// is loaded lazily with a dynamic import.
const loadParser = () => (parser ??= import("music-metadata"))

const cleanText = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, TEXT_LIMIT) : ""
const cleanInteger = (value: unknown, max: number): number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= max ? value : 0
const cleanYear = (value: unknown) => cleanInteger(typeof value === "string" ? Number(value) : value, 9999)

// Keeps only known, valid tag fields; empty values are omitted.
export function cleanTags(input: unknown): FileTags {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const tags: FileTags = {}
  for (const field of TEXT_FIELDS) {
    const text = cleanText(value[field])
    if (text) tags[field] = text
  }
  const year = cleanYear(value.year)
  if (year) tags.year = year
  const trackNo = cleanInteger(value.trackNo, 9999)
  if (trackNo) tags.trackNo = trackNo
  const discNo = cleanInteger(value.discNo, 999)
  if (discNo) tags.discNo = discNo
  const duration = value.duration
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0 && duration < 86_400) tags.duration = Math.round(duration * 10) / 10
  if (typeof value.cover === "string" && COVER_NAME.test(value.cover)) tags.cover = value.cover
  return tags
}

// In-app overrides: an empty string clears the field, so it is kept.
export function cleanTagEdit(input: unknown): TagEdit {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const edit: TagEdit = {}
  for (const field of EDITABLE_FIELDS) {
    if (value[field] === undefined) continue
    if (field === "year") {
      const year = value.year === "" || value.year === 0 ? 0 : cleanYear(value.year)
      if (year || value.year === "" || value.year === 0) edit.year = year
    } else {
      const text = value[field]
      if (typeof text === "string") edit[field] = cleanText(text)
    }
  }
  return edit
}

async function storeCover(picture: IPicture | null | undefined, coversDir: string) {
  const extension = COVER_EXTENSIONS[String(picture?.format ?? "").toLowerCase()]
  const data = picture?.data
  if (!coversDir || !extension || !data?.length || data.length > MAX_COVER_BYTES) return ""
  const name = `${createHash("sha256").update(data).digest("hex")}.${extension}`
  try {
    await fs.mkdir(coversDir, { recursive: true })
    await fs.writeFile(path.join(coversDir, name), data, { flag: "wx" })
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") return "" }
  return name
}

export async function readTags(file: string, coversDir: string): Promise<FileTags> {
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
export async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const run = async () => { while (next < items.length) { const index = next++; results[index] = await worker(items[index], index) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

export async function coverResponse(url: URL, coversDir: string): Promise<Response> {
  const name = url.pathname.slice(1)
  if (!COVER_NAME.test(name) || !coversDir) return new Response(null, { status: 404 })
  try {
    const data = await fs.readFile(path.join(coversDir, name))
    return new Response(data, { headers: { "Content-Type": COVER_TYPES[name.split(".").pop() ?? ""], "Cache-Control": "max-age=31536000, immutable" } })
  } catch { return new Response(null, { status: 404 }) }
}
