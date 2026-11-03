import test from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import { Readable } from "node:stream"
import { EventEmitter } from "node:events"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { TorrentEngine, isAudioName, isSupportedSource, normalizeInfoHash, torrentTrackId, defaultFileIndex, decodeBase32, savePath, availablePath, resolveSource } from "./torrent.ts"
import { audioResponse } from "./audio.ts"
import type { VirtualTracks } from "./audio.ts"
import type { SaveOutcome } from "./torrent.ts"
import type { Torrent } from "webtorrent"

test("isAudioName matches supported extensions only", () => {
  assert.equal(isAudioName("01 - Track.flac"), true)
  assert.equal(isAudioName("cover.jpg"), false)
  assert.equal(isAudioName("release.nfo"), false)
})

test("isSupportedSource accepts magnets and .torrent urls", () => {
  assert.equal(isSupportedSource("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=x"), true)
  assert.equal(isSupportedSource("https://example.org/download/1.torrent"), true)
  assert.equal(isSupportedSource("https://example.org/details/1"), false)
  assert.equal(isSupportedSource("file:///etc/passwd"), false)
})

test("decodeBase32 follows RFC 4648", () => {
  assert.equal(decodeBase32("JBSWY3DP"), "48656c6c6f") // "Hello"
  assert.equal(decodeBase32("MZXW6YTBOI"), "666f6f626172")
  assert.equal(decodeBase32("mzxw6ytboi"), "666f6f626172") // lowercase tolerated
  assert.equal(decodeBase32("MZXW6==="), "666f6f") // padding ignored
  assert.equal(decodeBase32("MZXW 6YTB"), null) // whitespace rejected
})

test("normalizeInfoHash decodes base32 and lowercases hex", () => {
  assert.equal(normalizeInfoHash("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01"), "abcdef0123456789abcdef0123456789abcdef01")
  assert.equal(normalizeInfoHash("magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF012"), null) // malformed btih length
  assert.equal(normalizeInfoHash("magnet:?xt=urn:btih:AERUKZ4JVPG66AJDIVTYTK6N54ASGRLH&dn=x"), "0123456789abcdef0123456789abcdef01234567")
  assert.equal(normalizeInfoHash("magnet:?xt=urn:btih:AERUKZ4JVPG66AJDIVTYTK6N54ASGRL1"), null) // '1' is not in the base32 alphabet
  assert.equal(normalizeInfoHash("https://example.org/1.torrent"), null)
})

test("torrentTrackId produces the 64-hex ids the protocol route expects", () => {
  const id = torrentTrackId("0123456789abcdef0123456789abcdef01234567", 3)
  assert.match(id, /^[a-f0-9]{64}$/)
  assert.notEqual(id, torrentTrackId("0123456789abcdef0123456789abcdef01234567", 4))
})

test("defaultFileIndex picks the largest audio file", () => {
  const files = [{ name: "a.nfo", length: 5 }, { name: "small.mp3", length: 10 }, { name: "big.flac", length: 900 }]
  assert.equal(defaultFileIndex(files), 2)
  assert.equal(defaultFileIndex([{ name: "a.nfo", length: 5 }]), -1)
})

// Virtual torrent tracks served by audio.ts: a fake engine stands in for
// webtorrent so the range semantics stay testable without the network.
function fakeEngine(id: string, length: number, chunk = "x"): VirtualTracks {
  return {
    resolveTrack(requested) {
      if (requested !== id) return null
      return {
        length,
        contentType: "audio/flac",
        stream: (start: number, end: number) => Readable.from([chunk.repeat(Math.min(4096, end - start + 1))]),
      }
    },
  }
}

const library = { resolveTrack: async () => null }
const request = (id: string, range: string | null = null, method = "GET") => new Request(`https://track/${id}`, { method, headers: range ? { range } : {} })

test("audioResponse serves a virtual torrent track with ranges", async () => {
  const id = "a".repeat(64)
  const engine = fakeEngine(id, 1000)
  const full = await audioResponse(request(id), library, engine)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get("content-length"), "1000")
  assert.equal(full.headers.get("content-type"), "audio/flac")
  const partial = await audioResponse(request(id, "bytes=0-99"), library, engine)
  assert.equal(partial.status, 206)
  assert.equal(partial.headers.get("content-length"), "100")
  assert.equal(partial.headers.get("content-range"), "bytes 0-99/1000")
})

test("audioResponse rejects invalid ranges and unknown ids for torrent tracks", async () => {
  const id = "a".repeat(64)
  const engine = fakeEngine(id, 1000)
  const invalid = await audioResponse(request(id, "bytes=5000-6000"), library, engine)
  assert.equal(invalid.status, 416)
  const missing = await audioResponse(request(id), library, fakeEngine("b".repeat(64), 10))
  assert.equal(missing.status, 404)
  const head = await audioResponse(request(id, null, "HEAD"), library, engine)
  assert.equal(head.status, 200)
  assert.equal(head.headers.get("accept-ranges"), "bytes")
})

// webtorrent v3 hands out streamx streams, which are async iterable but not
// Node streams; Readable.toWeb rejects them (ERR_MISSING_OPTION).
test("audioResponse serves virtual tracks whose streams are not Node streams", async () => {
  const id = "c".repeat(64)
  const engine: VirtualTracks = {
    resolveTrack: (requested) => requested !== id ? null : {
      length: 6,
      contentType: "audio/mpeg",
      stream: (start, end) => ({
        async *[Symbol.asyncIterator]() { yield Buffer.from("abcdef".slice(start, end + 1)) },
      }),
    },
  }
  const response = await audioResponse(request(id, "bytes=1-3"), library, engine)
  assert.equal(response.status, 206)
  assert.equal(await response.text(), "bcd")
})

test("savePath keeps torrent paths inside the save folder", () => {
  const root = path.resolve("/music/saved")
  assert.equal(savePath(root, "Artist - Album/01 - Song.flac"), path.join(root, "Artist - Album", "01 - Song.flac"))
  assert.equal(savePath(root, "../../etc/evil.mp3"), path.join(root, "etc", "evil.mp3"))
  assert.equal(savePath(root, "..\\..\\x\\a.mp3"), path.join(root, "x", "a.mp3"))
  assert.equal(savePath(root, "Album/CON/AUX.flac"), path.join(root, "Album", "_CON", "_AUX.flac"))
  assert.equal(savePath(root, 'Al<b>um?/tr:ack*.mp3'), path.join(root, "Al_b_um_", "tr_ack_.mp3"))
  assert.equal(savePath(root, ".hidden/ .. /song. .mp3"), path.join(root, "hidden", "song.mp3"))
  assert.equal(savePath(root, "A/B/C/D/E/f.ogg"), path.join(root, "A", "D", "E", "f.ogg"))
  const long = savePath(root, `${"x".repeat(300)}.flac`)
  assert.equal(path.basename(long).length, 120)
  assert.ok(long.endsWith(".flac"))
  assert.throws(() => savePath(root, "Album/cover.jpg"))
  assert.throws(() => savePath(root, "../.."))
})

test("availablePath reuses identical saves and never overwrites different files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-music-save-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, "Song.flac")
  assert.deepEqual(await availablePath(file, 4), { path: file, exists: false })
  await fs.writeFile(file, "abcd")
  assert.deepEqual(await availablePath(file, 4), { path: file, exists: true })
  assert.deepEqual(await availablePath(file, 9), { path: path.join(root, "Song (2).flac"), exists: false })
})

// Fake webtorrent objects: files are EventEmitters that emit "done" once
// their pieces are verified, exactly like webtorrent's File.
// The fakes implement only what TorrentEngine touches, hence the cast.
function fakeTorrent(infoHash: string, name: string, entries: [relative: string, content: string, done?: boolean][]): Torrent {
  const files = entries.map(([relative, content, done = true]) => Object.assign(new EventEmitter(), {
    name: path.basename(relative),
    path: `${name}/${relative}`,
    length: Buffer.byteLength(content),
    downloaded: done ? Buffer.byteLength(content) : 0,
    done,
    createReadStream: () => Readable.from([Buffer.from(content)]),
  }))
  return { infoHash, name, files, destroyed: false, progress: 0, numPeers: 0, downloadSpeed: 0, destroy(this: { destroyed: boolean }) { this.destroyed = true } } as unknown as Torrent
}

async function engineFixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-music-engine-"))
  const engine = new TorrentEngine({ cachePath: path.join(root, "cache") })
  t.after(async () => { engine.stopSweeper(); await fs.rm(root, { recursive: true, force: true }) })
  const outcomes: SaveOutcome[] = []
  let resolveNext: ((outcome: SaveOutcome) => void) | undefined
  engine.onSaved = (outcome) => { outcomes.push(outcome); resolveNext?.(outcome) }
  const nextOutcome = () => new Promise<SaveOutcome>((resolve) => { resolveNext = resolve })
  const add = (torrent: Torrent) => { engine.torrents.set(torrent.infoHash, torrent); return torrent }
  return { root, saveRoot: path.join(root, "Saved"), engine, outcomes, nextOutcome, add }
}

test("saving copies finished audio files and reports them once", async (t) => {
  const { engine, saveRoot, nextOutcome, add } = await engineFixture(t)
  const torrent = add(fakeTorrent("a".repeat(40), "Artist - Album", [["01 - One.flac", "one"], ["cover.jpg", "img"], ["02 - Two.flac", "two", false]]))
  const finished = nextOutcome()
  const started = engine.startSave(torrent, [0, 1, 2, 2, "x", 99], saveRoot)
  assert.deepEqual(started, { infoHash: torrent.infoHash, name: "Artist - Album", queued: 2, pending: 2 })
  assert.deepEqual(engine.saveProgress(engine.saves.get(torrent.infoHash)), { files: 2, done: 0, progress: 0.5 })
  setTimeout(() => { torrent.files[2].done = true; torrent.files[2].emit("done") }, 5)
  const outcome = await finished
  assert.equal(outcome.cancelled, false)
  assert.equal(outcome.failed, 0)
  assert.deepEqual(outcome.paths.sort(), [path.join(saveRoot, "Artist - Album", "01 - One.flac"), path.join(saveRoot, "Artist - Album", "02 - Two.flac")])
  assert.equal(await fs.readFile(outcome.paths[1], "utf8"), "two")
  assert.equal(engine.saves.size, 0)
  assert.deepEqual(await fs.readdir(path.join(saveRoot, "Artist - Album")), ["01 - One.flac", "02 - Two.flac"])
})

test("pending saves survive the stream-only policy and cancel on an explicit stop", async (t) => {
  const { engine, saveRoot, nextOutcome, add } = await engineFixture(t)
  const saving = add(fakeTorrent("b".repeat(40), "Saving", [["track.mp3", "data", false]]))
  const streaming = add(fakeTorrent("c".repeat(40), "Streaming", [["other.mp3", "data"]]))
  engine.startSave(saving, [0], saveRoot)
  engine.retainOnly(streaming)
  assert.equal(saving.destroyed, false)
  await engine.stopAll()
  assert.equal(saving.destroyed, false)
  assert.equal(streaming.destroyed, true)
  const cancelled = nextOutcome()
  await engine.stopAll({ includeSaves: true })
  assert.deepEqual(await cancelled, { infoHash: saving.infoHash, name: "Saving", paths: [], failed: 1, cancelled: true })
  assert.equal(saving.destroyed, true)
  assert.equal(engine.saves.size, 0)
})

test("saveTrack saves the file behind a prepared virtual track", async (t) => {
  const { engine, saveRoot, nextOutcome, add } = await engineFixture(t)
  const torrent = add(fakeTorrent("d".repeat(40), "Single", [["a.mp3", "aaa"], ["b.mp3", "bbb"]]))
  const id = torrentTrackId(torrent.infoHash, 1)
  engine.tracks.set(id, { torrent, file: torrent.files[1] })
  const finished = nextOutcome()
  engine.saveTrack(id, saveRoot)
  assert.deepEqual((await finished).paths, [path.join(saveRoot, "Single", "b.mp3")])
  assert.throws(() => engine.saveTrack("f".repeat(64), saveRoot), /não está mais ativa/)
  assert.throws(() => engine.startSave(torrent, [0], "relative/folder"), /pasta válida/)
})

test("isSupportedSource accepts indexer download links only when vouched for", () => {
  const link = "http://localhost:9696/1/download?apikey=k&link=x"
  assert.equal(isSupportedSource(link), false)
  assert.equal(isSupportedSource(link, (url) => url.startsWith("http://localhost:9696/")), true)
  assert.equal(isSupportedSource("magnet:?dn=Name&xt=urn:btih:0123456789abcdef0123456789abcdef01234567"), true)
  assert.equal(normalizeInfoHash("magnet:?dn=Name&tr=udp%3A%2F%2Ft&xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567"), "0123456789abcdef0123456789abcdef01234567")
})

// Stubs fetch with a list of canned responses consumed in order.
function stubResponses(t: TestContext, responses: Response[]) {
  const original = globalThis.fetch
  const requests: { url: unknown; options?: RequestInit }[] = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const next = responses.shift()
    if (!next) throw new TypeError("unexpected request")
    return next
  }
  t.after(() => { globalThis.fetch = original })
  return requests
}

test("resolveSource follows indexer redirects to magnets without following them automatically", async (t) => {
  const magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=A%20B&tr=udp%3A%2F%2Ftracker"
  const requests = stubResponses(t, [new Response(null, { status: 301, headers: { location: magnet } })])
  assert.equal(await resolveSource("http://localhost:9696/1/download?apikey=k"), magnet)
  assert.equal(requests[0].options?.redirect, "manual")
  assert.equal(await resolveSource(magnet), magnet) // magnets never hit the network
  assert.equal(requests.length, 1)
})

test("resolveSource returns .torrent bytes after relative and absolute redirects", async (t) => {
  const torrent = Buffer.from("d8:announce3:url4:infod4:name1:xee")
  const requests = stubResponses(t, [
    new Response(null, { status: 302, headers: { location: "/other" } }),
    new Response(null, { status: 307, headers: { location: "https://tracker.example/file.torrent" } }),
    new Response(torrent, { status: 200 }),
  ])
  assert.deepEqual(await resolveSource("http://localhost:9696/1/download?apikey=k"), torrent)
  assert.deepEqual(requests.map((request) => request.url), ["http://localhost:9696/1/download?apikey=k", "http://localhost:9696/other", "https://tracker.example/file.torrent"])
})

test("resolveSource rejects pages, errors, and redirects to other schemes", async (t) => {
  stubResponses(t, [
    new Response("<html>login</html>", { status: 200 }),
    new Response("gone", { status: 404 }),
    new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }),
    new Response("magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567\n", { status: 200 }),
  ])
  await assert.rejects(resolveSource("http://localhost:9696/a"), /não devolveu um arquivo .torrent/)
  await assert.rejects(resolveSource("http://localhost:9696/b"), /código 404/)
  await assert.rejects(resolveSource("http://localhost:9696/c"), /endereço não suportado/)
  assert.equal(await resolveSource("http://localhost:9696/d"), "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567")
})

test("addTorrent refuses download links that the indexer settings do not vouch for", async (t) => {
  const { engine } = await engineFixture(t)
  await assert.rejects(engine.addTorrent("http://evil.example/download?x"), /não suportada/)
})
