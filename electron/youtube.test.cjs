const { test } = require("node:test")
const assert = require("node:assert/strict")
const { matchYouTubeUrl, parseYouTubeLinks, parseMetadata, describeYouTube, isYouTubeTrackPath, MAX_PLAYLIST_ENTRIES } = require("./youtube.cjs")

test("recognizes watch, shorts, live, embed, music, and playlist links and canonicalizes them", () => {
  assert.deepEqual(matchYouTubeUrl("https://www.youtube.com/watch?si=x&v=dQw4w9WgXcQ"), { kind: "video", id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
  assert.deepEqual(matchYouTubeUrl("http://youtu.be/dQw4w9WgXcQ?t=42"), { kind: "video", id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
  assert.equal(matchYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.kind, "video")
  assert.equal(matchYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ")?.kind, "video")
  assert.equal(matchYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")?.kind, "video")
  assert.equal(matchYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")?.kind, "video")
  assert.deepEqual(matchYouTubeUrl("https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"), { kind: "playlist", id: "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf", url: "https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf" })
  assert.equal(matchYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), null)
  assert.equal(matchYouTubeUrl("youtube.com/watch?v=dQw4w9WgXcQ"), null)
  assert.equal(matchYouTubeUrl("https://www.youtube.com/watch?v=short"), null)
  assert.equal(matchYouTubeUrl(42), null)
})

test("parses pasted text, deduplicates, and counts invalid tokens", () => {
  const text = `https://www.youtube.com/watch?v=dQw4w9WgXcQ
  https://youtu.be/dQw4w9WgXcQ ; https://www.youtube.com/playlist?list=PL1234567890abcdefghij
  https://example.com/music.mp3
  apenas texto`
  const { targets, invalid } = parseYouTubeLinks(text)
  assert.deepEqual(targets.map((target) => target.url), ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/playlist?list=PL1234567890abcdefghij"])
  assert.deepEqual(targets.map((target) => target.kind), ["video", "playlist"])
  assert.equal(invalid, 3)
  assert.deepEqual(parseYouTubeLinks(""), { targets: [], invalid: 0 })
  assert.deepEqual(parseYouTubeLinks(null), { targets: [], invalid: 0 })
})

test("parses yt-dlp metadata for single videos", () => {
  const { playlistTitle, videos } = parseMetadata(JSON.stringify({ id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", channel: "Rick Astley" }))
  assert.equal(playlistTitle, "")
  assert.deepEqual(videos, [{ id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Never Gonna Give You Up", channel: "Rick Astley" }])
  const missing = parseMetadata(JSON.stringify({ id: "dQw4w9WgXcQ", title: "\tMulti\nline ", uploader: "Canal" })).videos[0]
  assert.equal(missing.title, "Multi line")
  assert.equal(missing.channel, "Canal")
  assert.throws(() => parseMetadata("{}"), /vídeo válido/)
  assert.throws(() => parseMetadata("not json"))
})

test("flattens playlists, filters invalid entries, and caps the size", () => {
  const entries = [
    { id: "aaaaaaaaaaa", title: "Primeira", channel: "Canal" },
    { id: "bad", title: "Inválida" },
    null,
    { id: "bbbbbbbbbbb", title: "Segunda" },
  ]
  const { playlistTitle, videos } = parseMetadata(JSON.stringify({ _type: "playlist", title: "Minha playlist", entries }))
  assert.equal(playlistTitle, "Minha playlist")
  assert.deepEqual(videos.map((video) => video.title), ["Primeira", "Segunda"])
  assert.equal(videos[1].channel, "")
  assert.equal(videos[1].url, "https://www.youtube.com/watch?v=bbbbbbbbbbb")

  const many = Array.from({ length: MAX_PLAYLIST_ENTRIES + 10 }, (_, index) => ({ id: `id${String(index).padStart(9, "0")}`.slice(0, 11), title: `Vídeo ${index}` }))
  assert.equal(parseMetadata(JSON.stringify({ _type: "playlist", title: "L", entries: many })).videos.length, MAX_PLAYLIST_ENTRIES)
})

test("describes tracks with stable ids derived from the canonical video URL", () => {
  const first = describeYouTube("https://youtu.be/dQw4w9WgXcQ?t=9", "Faixa", "Canal")
  const second = describeYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Faixa", "Canal")
  assert.equal(first.id, second.id)
  assert.equal(first.path, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  assert.equal(first.source, "youtube")
  assert.equal(first.format, "YouTube")
  assert.equal(first.folder, "Canal")
  assert.ok(isYouTubeTrackPath(first.path))
  assert.equal(isYouTubeTrackPath("https://evil.example/watch?v=dQw4w9WgXcQ"), false)
  assert.equal(isYouTubeTrackPath("/etc/passwd"), false)
  const untitled = describeYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "  ", "")
  assert.equal(untitled.title, "Vídeo do YouTube")
  assert.equal(untitled.folder, "YouTube")
})
