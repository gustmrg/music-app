# 1. Electron with bundled Chromium

- Status: accepted
- Date: 2026-08-30

## Context

The app began as a web prototype and moved to a desktop shell so it could read local folders, serve audio with byte ranges, and run `yt-dlp` and a torrent engine in a privileged process. The usual alternatives to Electron are Tauri and Wails, which render with the operating system's webview instead of bundling a browser. They produce much smaller binaries and use less RAM.

For a music player, the deciding factor is audio codec support. A system webview inherits the platform's codecs: WebKitGTK on Linux depends on the GStreamer plugins each distribution ships, and WebKit on macOS does not play Ogg/Vorbis or FLAC in every version. Electron bundles the same Chromium on every platform, so MP3, FLAC, WAV, Ogg, Opus, M4A/AAC, and WebM play everywhere through a plain `<audio>` element.

## Decision

Use Electron with its bundled Chromium. Privileged work stays in the main process, behind a restricted preload API (`contextIsolation`, `sandbox`, no `nodeIntegration`).

Revisit this only if a project goal changes in a way that outweighs codec consistency, for example:

- a very small installer or minimal memory use becomes a goal;
- learning Rust or Go becomes a goal in itself;
- the app grows toward video, where a native media stack matters more.

## Consequences

- Playback behaves the same on macOS, Windows, and Linux, and needs no per-platform codec work.
- Installers are around 100 MB and idle memory is higher than with a native webview.
- The project must track Electron's support window for Chromium security fixes.
- A future rewrite would redo the library, playlists, M3U import and export, queue, range protocol, yt-dlp integration, frameless window, packaging, and translations. That cost is the reason not to treat a rewrite as a routine option.

## Alternatives considered

- **Tauri** (Rust, system webview): small and fast, but codec support varies by platform and distribution.
- **Wails** (Go, system webview): same trade-off as Tauri.
- **A web app only**: cannot read local folders freely, run yt-dlp, or host a torrent engine.
