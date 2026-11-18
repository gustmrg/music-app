import { test } from "node:test"
import assert from "node:assert/strict"
import { matchYouTubeUrl, parseYouTubeLinks, parseMetadata, parseResolved, isLiveInfo, describeYouTube, describeYtDlpError, isYouTubeTrackPath, MAX_PLAYLIST_ENTRIES, STREAM_FORMAT } from "./youtube.ts"
import { YT_DLP_UPDATE_HINT } from "../shared/messages.ts"

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

test("recognizes channel live pages and keeps them as channel targets", () => {
  assert.deepEqual(matchYouTubeUrl("https://www.youtube.com/@LofiGirl/live"), { kind: "channel-live", id: "@LofiGirl", url: "https://www.youtube.com/@LofiGirl/live" })
  assert.equal(matchYouTubeUrl("https://youtube.com/@lofi.girl-2/live/?si=abc")?.url, "https://www.youtube.com/@lofi.girl-2/live")
  assert.equal(matchYouTubeUrl("https://m.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow/live")?.url, "https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow/live")
  assert.equal(matchYouTubeUrl("https://www.youtube.com/c/LofiGirl/live")?.kind, "channel-live")
  assert.equal(matchYouTubeUrl("https://www.youtube.com/user/ChilledCow/live")?.kind, "channel-live")
  // A /live/<id> link names one stream, so it stays a video target.
  assert.equal(matchYouTubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ")?.kind, "video")
  assert.equal(matchYouTubeUrl("https://www.youtube.com/@LofiGirl"), null)
  assert.equal(matchYouTubeUrl("https://www.youtube.com/@LofiGirl/videos"), null)
  assert.equal(matchYouTubeUrl("https://www.youtube.com/channel/short/live"), null)
  assert.equal(matchYouTubeUrl("https://evil.example/@LofiGirl/live"), null)
  assert.equal(matchYouTubeUrl("https://www.youtube.com.evil.example/@LofiGirl/live"), null)
  const { targets } = parseYouTubeLinks("https://www.youtube.com/@LofiGirl/live\nhttps://youtube.com/@LofiGirl/live?x=1")
  assert.deepEqual(targets.map((target) => target.url), ["https://www.youtube.com/@LofiGirl/live"])
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
  assert.deepEqual(videos, [{ id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Never Gonna Give You Up", channel: "Rick Astley", isLive: false }])
  const missing = parseMetadata(JSON.stringify({ id: "dQw4w9WgXcQ", title: "\tMulti\nline ", uploader: "Canal" })).videos[0]
  assert.equal(missing.title, "Multi line")
  assert.equal(missing.channel, "Canal")
  assert.throws(() => parseMetadata("{}"), /vídeo válido/)
  assert.throws(() => parseMetadata("not json"))
})

test("detects lives and keeps the title without yt-dlp's date suffix", () => {
  const live = parseMetadata(JSON.stringify({ id: "0sfDth4lMLc", title: "lofi radio 2026-11-02 22:34", fulltitle: "lofi radio", channel: "Lofi Girl", is_live: true, live_status: "is_live" })).videos[0]
  assert.equal(live.isLive, true)
  assert.equal(live.title, "lofi radio")
  const regular = parseMetadata(JSON.stringify({ id: "dQw4w9WgXcQ", title: "Faixa", live_status: "not_live", is_live: false })).videos[0]
  assert.equal(regular.isLive, false)
  assert.equal(regular.title, "Faixa")
})

test("treats only streams that are on air as live", () => {
  assert.equal(isLiveInfo({ live_status: "is_live" }), true)
  for (const status of ["is_upcoming", "was_live", "post_live", "not_live"]) assert.equal(isLiveInfo({ live_status: status, is_live: true }), false, status)
  // Flat playlist entries carry no status; the boolean is the fallback.
  assert.equal(isLiveInfo({ live_status: null, is_live: true }), true)
  assert.equal(isLiveInfo({ live_status: null, is_live: null }), false)
  assert.equal(isLiveInfo({}), false)
  assert.equal(isLiveInfo(null), false)
})

test("parses the resolved stream URL and live status", () => {
  assert.deepEqual(parseResolved("is_live\nhttps://manifest.googlevideo.com/api/manifest/hls_playlist/index.m3u8\n"), { url: "https://manifest.googlevideo.com/api/manifest/hls_playlist/index.m3u8", isLive: true })
  assert.deepEqual(parseResolved("not_live\r\nhttps://rr1---sn.googlevideo.com/videoplayback?id=1\r\n"), { url: "https://rr1---sn.googlevideo.com/videoplayback?id=1", isLive: false })
  assert.equal(parseResolved("NA\nhttps://example.googlevideo.com/a").isLive, false)
  assert.equal(parseResolved("https://example.googlevideo.com/a").isLive, false)
  assert.throws(() => parseResolved("is_live\nNA"), /obter o áudio/)
  assert.throws(() => parseResolved(""), /obter o áudio/)
  // No URL at all is what an outdated yt-dlp tends to produce.
  assert.throws(() => parseResolved(""), (error: Error) => error.message.includes(YT_DLP_UPDATE_HINT))
})

test("prefers audio-only formats and falls back to the smallest live variant", () => {
  assert.equal(STREAM_FORMAT, "bestaudio/91/worst")
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
  assert.equal(videos[1].isLive, false)
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
  assert.equal(first.isLive, false)
  assert.equal(describeYouTube(second.path, "Live", "Canal", true).isLive, true)
  assert.equal(describeYouTube(second.path, "Live", "Canal", "yes").isLive, false)
  assert.ok(isYouTubeTrackPath(first.path))
  assert.equal(isYouTubeTrackPath("https://evil.example/watch?v=dQw4w9WgXcQ"), false)
  assert.equal(isYouTubeTrackPath("/etc/passwd"), false)
  const untitled = describeYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "  ", "")
  assert.equal(untitled.title, "Vídeo do YouTube")
  assert.equal(untitled.folder, "YouTube")
})

test("explains the yt-dlp errors a listener can act on", () => {
  const cases: [string, RegExp][] = [
    ["ERROR: [youtube] abc: This live event will begin in 2 hours.", /ainda não começou/],
    ["ERROR: [youtube] jfKfPfyJRdk: This live stream recording is not available.", /transmissão terminou/],
    ["ERROR: [youtube] abc: Private video. Sign in if you've been granted access to this video", /privado/],
    ["ERROR: [youtube] abc: The uploader has not made this video available in your country", /sua região/],
    ["ERROR: [youtube] abc: Sign in to confirm your age. This video may be inappropriate for some users.", /restrição de idade/],
    ["ERROR: [youtube] abc: Join this channel to get access to members-only content like this video", /membros/],
    ["ERROR: [youtube] abc: Video unavailable. This video has been removed by the uploader", /não está mais disponível/],
  ]
  for (const [details, expected] of cases) {
    const message = describeYtDlpError(details)
    assert.match(message, expected, details)
    // These are about the video itself; updating yt-dlp would not help.
    assert.ok(!message.includes(YT_DLP_UPDATE_HINT), details)
  }
})

test("suggests updating yt-dlp for errors it does not recognize", () => {
  const message = describeYtDlpError("ERROR: [youtube] abc: Requested format is not available")
  assert.ok(message.startsWith("ERROR: [youtube] abc: Requested format is not available"))
  assert.ok(message.endsWith(YT_DLP_UPDATE_HINT))
})
