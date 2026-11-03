const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const { LocalLibrary } = require("./library.cjs")
const { readTags, cleanTags, cleanTagEdit, coverResponse } = require("./metadata.cjs")

const fixtures = path.join(__dirname, "fixtures")

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-music-tags-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const music = path.join(root, "music")
  await fs.mkdir(music)
  for (const name of ["tagged.mp3", "tagged.flac"]) await fs.copyFile(path.join(fixtures, name), path.join(music, name))
  return { root, music, covers: path.join(root, "covers") }
}

test("readTags reads common fields and stores the cover by content hash", async (t) => {
  const { music, covers } = await workspace(t)
  const tags = await readTags(path.join(music, "tagged.mp3"), covers)
  assert.equal(tags.title, "Primeira")
  assert.equal(tags.artist, "Artista Teste")
  assert.equal(tags.albumArtist, "Banda Teste")
  assert.equal(tags.album, "Álbum Teste")
  assert.equal(tags.genre, "Rock")
  assert.equal(tags.year, 2019)
  assert.equal(tags.trackNo, 3)
  assert.equal(tags.discNo, 1)
  assert.ok(tags.duration > 0.9 && tags.duration < 1.2)
  assert.match(tags.cover, /^[a-f0-9]{64}\.png$/)
  assert.ok((await fs.stat(path.join(covers, tags.cover))).size > 0)
  // Same image again reuses the stored file.
  assert.equal((await readTags(path.join(music, "tagged.mp3"), covers)).cover, tags.cover)

  const flac = await readTags(path.join(music, "tagged.flac"), covers)
  assert.deepEqual({ artist: flac.artist, album: flac.album, trackNo: flac.trackNo, year: flac.year, cover: flac.cover }, { artist: "Artista FLAC", album: "Disco FLAC", trackNo: 7, year: 2001, cover: undefined })
})

test("cleanTags and cleanTagEdit drop invalid values", () => {
  assert.deepEqual(cleanTags({ artist: " A\u0000B ", album: 3, year: "abc", trackNo: -1, duration: Infinity, cover: "../x.png" }), { artist: "A B" })
  assert.deepEqual(cleanTagEdit({ album: " Novo ", year: "1999", artist: "", genre: 4, title: "x" }), { album: "Novo", year: 1999, artist: "" })
  assert.deepEqual(cleanTagEdit({ year: "" }), { year: 0 })
})

test("import reads tags, caches them, and keeps edits only for known tracks", async (t) => {
  const { root, music, covers } = await workspace(t)
  const store = path.join(root, "library.json")
  const library = new LocalLibrary(store, { coversDir: covers })
  await library.load()
  const { tracks, imported } = await library.addFolder(music)
  const mp3 = tracks.find((track) => track.format === "MP3")
  assert.equal(mp3.album, "Álbum Teste")
  assert.equal(mp3.title, "Primeira")
  // Untagged titles keep the file name.
  assert.equal(tracks.find((track) => track.format === "FLAC").title, "tagged")
  assert.equal(mp3.scanned, true)
  assert.ok(mp3.addedAt > 0)
  await library.savePreferences({ tagEdits: { [imported[0]]: { album: "Editado" }, unknown: { album: "x" } } })

  // Reloading must not read the files again: corrupt them and compare.
  for (const name of await fs.readdir(music)) await fs.writeFile(path.join(music, name), "not audio anymore")
  const restored = new LocalLibrary(store, { coversDir: covers })
  const saved = await restored.load()
  assert.equal(saved.tracks.find((track) => track.id === mp3.id).album, "Álbum Teste")
  assert.equal(saved.tracks.find((track) => track.id === mp3.id).title, "Primeira")
  assert.equal(saved.tracks.find((track) => track.id === mp3.id).addedAt, mp3.addedAt)
  assert.deepEqual(saved.tagEdits, { [imported[0]]: { album: "Editado" } })
})

test("scanPending reads tags of tracks saved before tag support", async (t) => {
  const { root, music, covers } = await workspace(t)
  const store = path.join(root, "library.json")
  const files = (await fs.readdir(music)).map((name) => path.join(music, name))
  await fs.writeFile(store, JSON.stringify({ version: 1, tracks: files.map((file) => ({ path: file })) }))
  const library = new LocalLibrary(store, { coversDir: covers })
  const loaded = await library.load()
  assert.ok(loaded.tracks.every((track) => !track.scanned && !track.album))
  const batches = []
  assert.equal(await library.scanPending((tracks) => batches.push(tracks), 1), 2)
  assert.equal(batches.length, 2)
  assert.deepEqual(batches[1].map((track) => track.album).sort(), ["Disco FLAC", "Álbum Teste"])
  assert.equal(await library.scanPending(), 0)
})

test("coverResponse serves stored covers and rejects other names", async (t) => {
  const { music, covers } = await workspace(t)
  const { cover } = await readTags(path.join(music, "tagged.mp3"), covers)
  const ok = await coverResponse(new URL(`local-music://cover/${cover}`), covers)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get("content-type"), "image/png")
  assert.equal((await coverResponse(new URL("local-music://cover/..%2Flibrary.json"), covers)).status, 404)
  assert.equal((await coverResponse(new URL(`local-music://cover/${"0".repeat(64)}.png`), covers)).status, 404)
})
