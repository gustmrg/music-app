const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const { pathToFileURL } = require("node:url")
const { LocalLibrary, playlistPaths } = require("./library.cjs")
const { audioResponse } = require("./audio.cjs")

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-music-test-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const music = path.join(root, "Músicas")
  await fs.mkdir(path.join(music, "Álbum"), { recursive: true })
  const files = [path.join(music, "01 - Canção.wav"), path.join(music, "Álbum", "02 - Outra.MP3")]
  for (const file of files) await fs.writeFile(file, "original audio bytes")
  await fs.writeFile(path.join(music, "notes.txt"), "not audio")
  const library = new LocalLibrary(path.join(root, "data", "library.json"))
  await library.load()
  return { root, music, files, library }
}

test("imports recursively, deduplicates files, and never changes the source", async (t) => {
  const { library, music, files } = await fixture(t)
  const result = await library.addFolder(music)
  assert.equal(result.tracks.length, 2)
  assert.equal(result.skipped, 0)
  assert.equal((await library.addFiles(files)).tracks.length, 2)
  for (const file of files) assert.equal(await fs.readFile(file, "utf8"), "original audio bytes")
})

test("persists favorites, recent history, volume, and playlist ordering on reload", async (t) => {
  const { library, music } = await fixture(t)
  const { imported } = await library.addFolder(music)
  await library.savePreferences({ liked: [imported[0], "untrusted-id"], recent: [imported[1]], volume: 0.3, playlists: [{ id: "mix", name: " Mix ", trackIds: [...imported].reverse() }] })
  const restored = new LocalLibrary(library.storeFile)
  const saved = await restored.load()
  assert.deepEqual(saved.liked, [imported[0]])
  assert.deepEqual(saved.recent, [imported[1]])
  assert.equal(saved.volume, 0.3)
  assert.deepEqual(saved.playlists, [{ id: "mix", name: "Mix", trackIds: [...imported].reverse() }])
})

test("imports local M3U paths with BOM, accents, spaces, and missing files; skips remote URLs", async (t) => {
  const { library, root, files } = await fixture(t)
  const playlistFile = path.join(root, "mix.m3u8")
  await fs.writeFile(playlistFile, `\uFEFF#EXTM3U\r\n#EXTINF:-1,Canção\r\nMúsicas/01 - Canção.wav\r\n${pathToFileURL(files[1]).href}\r\nhttps://example.com/song.mp3\r\nmissing.mp3\r\n`)
  const result = await library.importPlaylist(playlistFile)
  assert.equal(result.tracks.length, 2)
  assert.equal(result.playlist.trackIds.length, 2)
  assert.equal(result.skipped, 2)
  assert.equal(result.playlist.name, "mix")
})

test("exports relative M3U8 paths in playlist order and can reimport them", async (t) => {
  const { library, root, music } = await fixture(t)
  const { imported } = await library.addFolder(music)
  const target = path.join(root, "export.m3u8")
  await library.exportPlaylist(target, [...imported].reverse())
  assert.ok((await fs.readFile(target, "utf8")).startsWith("#EXTM3U\n"))
  assert.deepEqual((await library.importPlaylist(target)).playlist.trackIds, [...imported].reverse())
  await assert.rejects(library.exportPlaylist(path.join(root, "audio.mp3"), imported), /extensão/)
})

test("does not follow directory symlinks or expose an unselected track", async (t) => {
  const { library, root, music } = await fixture(t)
  const outside = path.join(root, "outside")
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, "private.mp3"), "private")
  await fs.symlink(outside, path.join(music, "shortcut"), "dir")
  assert.equal((await library.addFolder(music)).tracks.length, 2)
  assert.equal(await library.resolveTrack("unknown"), null)
  const track = library.snapshot().tracks[0]
  assert.equal(await library.resolveTrack(track.id), track.path)
  await fs.unlink(track.path)
  await fs.symlink(path.join(outside, "private.mp3"), track.path)
  assert.equal(await library.resolveTrack(track.id), null)
})

test("retains references to missing files and does not overwrite a corrupt library", async (t) => {
  const { library, files } = await fixture(t)
  await library.addFiles(files)
  await fs.unlink(files[0])
  const restored = new LocalLibrary(library.storeFile)
  assert.equal((await restored.load()).tracks.length, 2)
  await fs.writeFile(library.storeFile, "corrupt state")
  await assert.rejects(new LocalLibrary(library.storeFile).load())
  assert.equal(await fs.readFile(library.storeFile, "utf8"), "corrupt state")
})

test("serializes concurrent preference saves without corrupting the store", async (t) => {
  const { library, files } = await fixture(t)
  const { imported } = await library.addFiles(files)
  await Promise.all([library.savePreferences({ volume: 0.2 }), library.savePreferences({ volume: 0.9, liked: imported })])
  const saved = await new LocalLibrary(library.storeFile).load()
  assert.equal(saved.volume, 0.9)
  assert.deepEqual(saved.liked, imported)
})

test("ignores network paths and remote protocols when parsing local playlists", () => {
  assert.deepEqual(playlistPaths("https://site/music.mp3\n//host/share/music.mp3\n\\\\host\\share\\music.mp3\ndata:audio/mp3;base64,AAA\nfile://host/share/music.mp3", "/tmp/list.m3u"), [])
})

test("serves full audio, exact byte ranges, suffix ranges, and HEAD without reading the whole file", async (t) => {
  const { library, files } = await fixture(t)
  const { imported } = await library.addFiles(files)
  const url = `local-music://track/${imported[0]}`
  const full = await audioResponse(new Request(url), library)
  assert.equal(full.status, 200)
  assert.equal(await full.text(), "original audio bytes")
  for (const [range, text] of [["bytes=0-3", "orig"], ["bytes=9-", "audio bytes"], ["bytes=-5", "bytes"]]) {
    const response = await audioResponse(new Request(url, { headers: { Range: range } }), library)
    assert.equal(response.status, 206)
    assert.equal(await response.text(), text)
    assert.equal(response.headers.get("Content-Length"), String(text.length))
  }
  const head = await audioResponse(new Request(url, { method: "HEAD" }), library)
  assert.equal(head.status, 200)
  assert.equal(head.headers.get("Content-Length"), "20")
  assert.equal(await head.text(), "")
  for (const range of ["bytes=99-", "bytes=5-3", "bytes=-0", "bytes=0-1,3-4", "invalid"]) {
    const response = await audioResponse(new Request(url, { headers: { Range: range } }), library)
    assert.equal(response.status, 416)
    assert.equal(response.headers.get("Content-Range"), "bytes */20")
  }
  assert.equal((await audioResponse(new Request(url, { method: "POST" }), library)).status, 403)
  assert.equal((await audioResponse(new Request("local-music://track/unknown"), library)).status, 403)
})
