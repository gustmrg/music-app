import { test } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { pathToFileURL } from "node:url"
import { LocalLibrary, cleanPreferences, playlistPaths } from "./library.ts"
import { audioResponse } from "./audio.ts"

// Asserts that a value exists and narrows its type for the rest of the test.
function present<T>(value: T | null | undefined): T {
  assert.ok(value != null, "expected a value")
  return value
}

async function fixture(t: TestContext) {
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
  assert.equal(present(result.playlist).trackIds.length, 2)
  assert.equal(result.skipped, 2)
  assert.equal(present(result.playlist).name, "mix")
})

test("exports relative M3U8 paths in playlist order and can reimport them", async (t) => {
  const { library, root, music } = await fixture(t)
  const { imported } = await library.addFolder(music)
  const target = path.join(root, "export.m3u8")
  await library.exportPlaylist(target, [...imported].reverse())
  assert.ok((await fs.readFile(target, "utf8")).startsWith("#EXTM3U\n"))
  assert.deepEqual(present((await library.importPlaylist(target)).playlist).trackIds, [...imported].reverse())
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

test("keeps the save folder out of renderer preferences and falls back to the default", async (t) => {
  const { root } = await fixture(t)
  const defaultSaveFolder = path.join(root, "Default Music")
  const library = new LocalLibrary(path.join(root, "data", "save-folder.json"), { defaultSaveFolder })
  await library.load()
  assert.equal(library.snapshot().saveFolder, defaultSaveFolder)
  const chosen = path.join(root, "Chosen")
  assert.equal(await library.setSaveFolder(chosen), chosen)
  await library.savePreferences({ liked: [], recent: [], volume: 0.5, playlists: [], saveFolder: "/tmp/renderer-choice" })
  await assert.rejects(library.setSaveFolder("relative/path"))
  await assert.rejects(library.setSaveFolder("\\\\server\\share"))
  const restored = new LocalLibrary(library.storeFile, { defaultSaveFolder })
  assert.equal((await restored.load()).saveFolder, chosen)
  const stored = JSON.parse(await fs.readFile(library.storeFile, "utf8"))
  assert.equal(stored.saveFolder, chosen)
})

test("stores whether YouTube tracks are live and loads older libraries as not live", async (t) => {
  const { library, root } = await fixture(t)
  const videos = [
    { url: "https://www.youtube.com/watch?v=0sfDth4lMLc", title: "lofi radio", channel: "Lofi Girl", isLive: true },
    { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Faixa", channel: "Canal", isLive: false },
  ]
  const { imported } = await library.addVideos(videos)
  const [live, regular] = imported.map((id) => present(library.tracks.get(id)))
  assert.equal(live.isLive, true)
  assert.equal(regular.isLive, false)

  // A video that starts streaming after import is updated and persisted once.
  assert.equal(await library.setLive(regular.id, true), true)
  assert.equal(await library.setLive(regular.id, true), false)
  assert.equal(await library.setLive("missing", true), false)
  const reloaded = new LocalLibrary(library.storeFile)
  await reloaded.load()
  assert.equal(present(reloaded.tracks.get(live.id)).isLive, true)
  assert.equal(present(reloaded.tracks.get(regular.id)).isLive, true)

  // Libraries saved before live detection have no isLive field.
  const legacyFile = path.join(root, "legacy", "library.json")
  await fs.mkdir(path.dirname(legacyFile), { recursive: true })
  await fs.writeFile(legacyFile, JSON.stringify({ version: 1, tracks: [{ id: "x", path: videos[0].url, title: "lofi radio", folder: "Lofi Girl", format: "YouTube", source: "youtube" }] }))
  const legacy = new LocalLibrary(legacyFile)
  const { tracks } = await legacy.load()
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].isLive, false)
})

test("only YouTube tracks can be marked live", async (t) => {
  const { library, music } = await fixture(t)
  const { imported } = await library.addFolder(music)
  assert.equal(await library.setLive(imported[0], true), false)
  assert.equal(present(library.tracks.get(imported[0])).isLive, undefined)
})


test("restores the display mode and defaults older or invalid preferences to list", async (t) => {
  const { library } = await fixture(t)
  assert.equal(cleanPreferences({}, []).viewMode, "list")
  assert.equal(cleanPreferences({ viewMode: "unknown" }, []).viewMode, "list")
  await library.savePreferences({ ...library.preferences, viewMode: "grid" })
  assert.equal((await new LocalLibrary(library.storeFile).load()).viewMode, "grid")
})

// Folder watching: the library keeps the folders the user added and
// reconciles them with the disk. Removed files are marked missing, never
// dropped, so playlists and favorites keep pointing at them.
async function watched(t: TestContext) {
  const base = await fixture(t)
  const music = await fs.realpath(base.music)
  const files = await Promise.all(base.files.map((file) => fs.realpath(file)))
  const result = await base.library.addFolder(music)
  return { ...base, music, files, result }
}
const trackAt = (library: LocalLibrary, file: string) => library.snapshot().tracks.find((track) => track.path === file)

test("remembers added folders, merges nested ones, and keeps them across reloads", async (t) => {
  const { library, music, result } = await watched(t)
  assert.deepEqual(result.watchedFolders, [music])
  await library.addFolder(path.join(music, "Álbum"))
  assert.deepEqual(library.watchedFolders, [music])
  const parent = path.dirname(music)
  await library.addFolder(parent)
  assert.deepEqual(library.watchedFolders, [parent])
  assert.deepEqual((await new LocalLibrary(library.storeFile).load()).watchedFolders, [parent])
  // Older libraries have no list; invalid entries are dropped.
  await fs.writeFile(library.storeFile, JSON.stringify({ version: 1, tracks: [], watchedFolders: ["relative", 42, "//host/share", parent, parent] }))
  assert.deepEqual((await new LocalLibrary(library.storeFile).load()).watchedFolders, [parent])
})

test("reconciles new, removed, and restored files under a watched folder", async (t) => {
  const { library, music, files } = await watched(t)
  const added = path.join(music, "Novo", "tagged.mp3")
  await fs.mkdir(path.dirname(added))
  await fs.copyFile(path.join(import.meta.dirname, "fixtures", "tagged.mp3"), added)
  const removedId = present(trackAt(library, files[0])).id
  await library.savePreferences({ ...library.preferences, liked: [removedId], playlists: [{ id: "p", name: "P", trackIds: [removedId] }] })
  const original = await fs.readFile(files[0])
  await fs.rm(files[0])

  assert.equal((await library.reconcile([music])).changed, true)
  const fresh = present(trackAt(library, added))
  assert.equal(fresh.scanned, true)
  assert.ok(fresh.addedAt)
  assert.equal(present(trackAt(library, files[0])).missing, true)
  assert.deepEqual(library.preferences.liked, [removedId])
  assert.deepEqual(library.preferences.playlists[0].trackIds, [removedId])
  assert.equal((await library.reconcile([music])).changed, false)

  await fs.writeFile(files[0], original)
  await library.reconcile([path.join(music, "Novo")])
  assert.equal(present(trackAt(library, files[0])).missing, true, "a scope only reconciles its own subtree")
  await library.reconcile([music])
  assert.equal(present(trackAt(library, files[0])).missing, undefined)
})

test("carries favorites, playlists, and tag edits over to a renamed or moved file", async (t) => {
  const { library, music, files } = await watched(t)
  const before = present(trackAt(library, files[1]))
  await library.savePreferences({ ...library.preferences, liked: [before.id], recent: [before.id], tagEdits: { [before.id]: { album: "Editado" } }, playlists: [{ id: "p", name: "P", trackIds: [before.id] }] })
  const moved = path.join(music, "Outro lugar", "02 - Renomeada.mp3")
  await fs.mkdir(path.dirname(moved))
  await fs.rename(files[1], moved)

  // Watchers report the old and new folders separately.
  await library.reconcile([path.dirname(files[1])])
  const result = await library.reconcile([path.dirname(moved)])
  const after = present(trackAt(library, moved))
  assert.deepEqual(result.moved, { [before.id]: after.id })
  assert.equal(library.tracks.has(before.id), false)
  assert.equal(after.addedAt, before.addedAt)
  assert.deepEqual(library.preferences.liked, [after.id])
  assert.deepEqual(library.preferences.recent, [after.id])
  assert.deepEqual(library.preferences.playlists[0].trackIds, [after.id])
  assert.deepEqual(library.preferences.tagEdits, { [after.id]: { album: "Editado" } })
})

test("rereads tags only for files that changed", async (t) => {
  const { library, music } = await watched(t)
  const file = path.join(music, "tagged.flac")
  await fs.writeFile(file, "not yet audio")
  await library.reconcile([music])
  assert.equal(present(trackAt(library, file)).artist, undefined)
  // A file that finished copying, or whose tags another program edited.
  await fs.copyFile(path.join(import.meta.dirname, "fixtures", "tagged.flac"), file)
  await fs.utimes(file, new Date(), new Date(Date.now() + 5000))
  assert.equal((await library.reconcile([music])).changed, true)
  const updated = present(trackAt(library, file))
  assert.equal(updated.artist, "Artista FLAC")
  assert.equal(updated.size, (await fs.stat(file)).size)
})

test("leaves tracks alone while a watched folder is unreachable", async (t) => {
  const { library, music, root } = await watched(t)
  // An unmounted disk looks like a folder that no longer exists.
  const unmounted = path.join(root, "unmounted")
  await fs.rename(music, unmounted)
  assert.equal((await library.reconcile([music])).changed, false)
  assert.equal(library.snapshot().tracks.filter((track) => track.missing).length, 0)
  await fs.rename(unmounted, music)
  assert.equal((await library.reconcile([path.join(music, "Álbum", "gone")])).changed, false)
})

test("does not mark files missing inside folders it cannot read", { skip: process.getuid?.() === 0 }, async (t) => {
  const { library, music } = await watched(t)
  const album = path.join(music, "Álbum")
  await fs.chmod(album, 0o000)
  // Restored here: the fixture's cleanup cannot delete an unreadable folder.
  try { await library.reconcile([music]) } finally { await fs.chmod(album, 0o755) }
  assert.equal(library.snapshot().tracks.filter((track) => track.missing).length, 0)
})

test("picks up changes made while the app was closed", async (t) => {
  const { library, music, files } = await watched(t)
  await fs.rm(files[0])
  await fs.copyFile(path.join(import.meta.dirname, "fixtures", "tagged.mp3"), path.join(music, "tagged.mp3"))
  const reopened = new LocalLibrary(library.storeFile)
  await reopened.load()
  assert.equal((await reopened.reconcile(reopened.watchedFolders)).changed, true)
  assert.equal(present(trackAt(reopened, files[0])).missing, true)
  assert.ok(trackAt(reopened, path.join(music, "tagged.mp3")))
  const stored = present((await new LocalLibrary(library.storeFile).load()).tracks.find((track) => track.path === files[0]))
  assert.equal(stored.missing, true)
})

test("stops watching a folder without removing its tracks and removes missing tracks on request", async (t) => {
  const { library, music, files } = await watched(t)
  assert.deepEqual(await library.unwatchFolder(music), [])
  assert.equal(library.snapshot().tracks.length, 2)
  await fs.rm(files[0])
  assert.equal((await library.reconcile([music])).changed, false, "an unwatched folder is not reconciled")

  await library.addFolder(music)
  const missing = present(trackAt(library, files[0]))
  assert.equal(missing.missing, true)
  await library.savePreferences({ ...library.preferences, liked: [missing.id], playlists: [{ id: "p", name: "P", trackIds: [missing.id] }] })
  const result = await library.removeMissing()
  assert.deepEqual(result.removed, [missing.id])
  assert.equal(result.tracks.length, 1)
  assert.deepEqual(library.preferences.liked, [])
  assert.deepEqual(library.preferences.playlists[0].trackIds, [])
  // Files are never touched: the remaining one is intact.
  assert.equal(await fs.readFile(files[1], "utf8"), "original audio bytes")
})
