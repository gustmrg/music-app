# 3. YouTube livestreams play through yt-dlp and ffmpeg

- Status: accepted
- Date: 2026-11-02

## Context

Regular YouTube videos already play: `yt-dlp -f bestaudio/best` returns a direct audio-only URL (m4a or opus), and the player's `<audio>` element plays it.

Livestreams do not. YouTube offers no audio-only format for a live, so yt-dlp falls back to a combined video and audio format delivered as an HLS manifest (`.m3u8`), which Chromium's `<audio>` cannot open. On the LoFi Girl stream, checked on 2026-11-02, the selected format was 96: 1080p HLS with `avc1` video and `mp4a.40.2` audio.

Requirements:

- Play continuously while the window is minimized. Background listening is the main use case.
- Keep the single `<audio>`-based player used for local files, YouTube videos, and torrents.
- The project is an open-source hobby app for validating ideas. Following YouTube's API terms is not a design constraint (see the README's responsibility note).

## Decision

1. Resolve lives with `yt-dlp -f "bestaudio/91/worst"`. Regular videos still get their audio-only format. Lives get format 91 (144p), which carries the same AAC audio as the 1080p variant for a fraction of the bandwidth.
2. In the main process, run `ffmpeg -i <manifest> -vn -c:a copy -f adts pipe:1`. This drops the video and remuxes the AAC audio without re-encoding.
3. Serve ffmpeg's output on a new `local-music://live/<trackId>` route as `audio/aac`, with no length and no range support. The renderer keeps using `<audio>`.
4. Keep one ffmpeg process at a time. Pausing closes the stream and resuming reopens it, which returns to the live edge.

A proof of concept on 2026-11-02 produced valid AAC (44.1 kHz, stereo) from the live LoFi Girl stream without re-encoding.

## Consequences

- ffmpeg becomes a runtime dependency for lives, next to yt-dlp. When it is missing, lives show a clear error and everything else keeps working.
- The renderer needs no CSP or CORS changes, because it never contacts Google directly.
- Lives have no duration or seek. The player keeps a read-only progress bar with elapsed playback and buffered audio for the current connection; its timeline grows as audio arrives, and a "LIVE" badge sits beside it. Reopening the stream resets that timeline. It reconnects instead of skipping to the next track.
- The same yt-dlp and ffmpeg pipeline can later record or save audio to a file.

## Alternatives considered

- **YouTube IFrame Player API.** It requires a visible player of at least 200×200 and forbids background playback, which defeats the main use case. It also fails to load from `file://`, because no `Referer` is sent.
- **hls.js in the renderer.** It needs CSP and CORS opened to `*.googlevideo.com`, and feeding a muxed video and audio stream into `<audio>` through Media Source Extensions is uncertain.
- **mpv as the playback engine**, as the `lofi` terminal player does. Proven to work, but it would replace the whole player (seek, progress, events, local files) for one feature.
