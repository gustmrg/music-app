# Development

Use Node.js 22.18 or later and npm: the main-process tests are TypeScript run directly by Node, which strips types natively from 22.18. CI pins Node.js 24.22.1, the version bundled with Electron 45, so tests run on the same runtime as the main process. The project keeps `package-lock.json` as its only lockfile.

```bash
npm install
npm run dev          # Vite + Electron; the main process rebuilds and restarts on change
npm run dev:web      # web preview at http://127.0.0.1:5173
npm run typecheck    # renderer, main process, preload, and the IPC contract
npm test             # main-process tests (electron/*.test.ts)
npm run build        # interface into dist/, main process and preload into dist-electron/
npm run dist         # packaging into release/
```

The main process and preload are TypeScript in `electron/`. `scripts/build-electron.mjs` bundles them with esbuild into `dist-electron/main.cjs` and `dist-electron/preload.cjs`, which is what Electron and the packaged app load; see [ADR 4](adr/0004-main-process-in-typescript.md). The IPC contract lives in `shared/ipc.ts`: the main process registers handlers against it, the preload exposes it as `window.desktop`, and the renderer reads it, so a mismatch fails the typecheck.

The packaging targets are DMG, NSIS, AppImage, and deb. The app's internal identifier (`appId`) stays the same to keep its data directory. Changes go in through pull requests, and [CI](../.github/workflows/ci.yml) runs `typecheck`, `test`, and `build`. To publish a version, see [Releases](releasing.md).

## Layout

```text
.github/workflows/
  ci.yml             typecheck, tests, and build on PRs and main
  release.yml        version, packaging, and release publishing
docs/                detailed documentation
  adr/               architecture decision records
electron/
  main.ts            window, native pickers, IPC, and audio protocol
  preload.ts         restricted API exposed to the interface
  library.ts         files, playlists, and JSON persistence
  metadata.ts        embedded tags and cover art
  youtube.ts         YouTube links, metadata, and stream resolution via yt-dlp
  discover.ts        Prowlarr and Torznab search
  torrent.ts         torrent streaming and saving with webtorrent
  live.ts            YouTube lives remuxed to AAC by ffmpeg (local-music://live/)
  audio.ts           audio streaming with byte-range support
  webtorrent.d.ts    types for the parts of webtorrent the app uses
  *.test.ts          tests, run directly by Node
shared/
  types.ts           data shared by the main process and the interface
  ipc.ts             the IPC contract and the window.desktop API
  messages.ts        interface text used by both the main process and the interface
dist-electron/       bundled main.cjs and preload.cjs (generated)
build/
  icon.png           app icon used by electron-builder
public/
  icon.png           interface favicon
scripts/
  build-electron.mjs bundles electron/ into dist-electron/ (--watch for dev)
  checksums.mjs      generates the release SHA256SUMS.txt
src/
  App.tsx            library and playlist management
  library.ts         presentation helpers; re-exports the shared types
  components/Player.tsx  HTMLAudioElement playback
  components/ui/     the Button, Input, and Sheet components in use
  index.css          dark theme and local layout
```

## Security

The interface has no access to Node.js and runs with context isolation and the sandbox. The audio protocol only accepts identifiers of previously selected tracks; it does not take arbitrary paths. It follows the [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol/). Normal writes go to the library file; exporting only writes the playlist to the destination chosen in the native picker.
