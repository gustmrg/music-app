# Development

Use Node.js 22 or later and npm. The project keeps `package-lock.json` as its only lockfile.

```bash
npm install
npm run dev          # Vite + Electron
npm run dev:web      # web preview at http://127.0.0.1:5173
npm run typecheck
npm test             # import, playlists, YouTube, and local persistence
npm run build
npm run dist         # packaging into release/
```

The packaging targets are DMG, NSIS, AppImage, and deb. The app's internal identifier (`appId`) stays the same to keep its data directory. Changes go in through pull requests, and [CI](../.github/workflows/ci.yml) runs `typecheck`, `test`, and `build`. To publish a version, see [Releases](releasing.md).

## Layout

```text
.github/workflows/
  ci.yml             typecheck, tests, and build on PRs and main
  release.yml        version, packaging, and release publishing
docs/                detailed documentation
  adr/               architecture decision records
electron/
  main.cjs           window, native pickers, IPC, and audio protocol
  preload.cjs        restricted API exposed to the interface
  library.cjs        files, playlists, and JSON persistence
  youtube.cjs        YouTube links, metadata, and stream resolution via yt-dlp
  audio.cjs          audio streaming with byte-range support
  library.test.cjs   tests using temporary files
  youtube.test.cjs   tests for link parsing and metadata
build/
  icon.png           app icon used by electron-builder
public/
  icon.png           interface favicon
scripts/
  checksums.mjs      generates the release SHA256SUMS.txt
src/
  App.tsx            library and playlist management
  library.ts         types and presentation helpers
  components/Player.tsx  HTMLAudioElement playback
  components/ui/     the Button, Input, and Sheet components in use
  index.css          dark theme and local layout
```

## Security

The interface has no access to Node.js and runs with context isolation and the sandbox. The audio protocol only accepts identifiers of previously selected tracks; it does not take arbitrary paths. It follows the [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol/). Normal writes go to the library file; exporting only writes the playlist to the destination chosen in the native picker.
