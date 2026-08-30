# Cloud Music Desktop

An original desktop music experience built with Electron, React 19, Vite, TypeScript, and shadcn/ui on Base UI. Artwork is generated procedurally at runtime and playback uses a small Web Audio synthesizer, so the project contains no copied music or cover art.

## Development

Node.js 22+ is recommended.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite and opens the Electron window. For renderer-only work, use `npm run dev:web` and open `http://127.0.0.1:5173`.

This workspace also includes a `bun.lock`, so Bun users can use `bun install` and `bun run dev`.

## Build and package

```bash
npm run build       # type-check and build the renderer
npm run dist        # create an installer in release/
```

The packaging targets are DMG on macOS, NSIS on Windows, and AppImage/deb on Linux.

## Architecture

```text
electron/
  main.cjs          secure BrowserWindow lifecycle and native window IPC
  preload.cjs       narrow contextBridge API for window controls
src/
  App.tsx           React application and playback state
  audio.ts          original Web Audio synthesizer
  components/ui/    shadcn components generated for Base UI
  index.css         Tailwind v4 theme and desktop-specific overrides
js/
  data.js           seeded fictional catalog
  art.js            procedural canvas artwork generator
css/styles.css      original music-player visual system
components.json     shadcn Base UI configuration (`base-nova`)
```

The renderer has no Node.js access. Electron runs with context isolation, sandboxing, navigation restrictions, and a Content Security Policy. Only minimize, maximize, and close commands cross the preload boundary.

## Features

- Featured carousel, playlist collections, charts, artists, radio, liked and recent views
- Generated cover and banner artwork
- Synthesized ambient playback with seek, volume, queue, repeat, and shuffle controls
- Base UI-backed shadcn buttons, input, badges, tooltips, slider, and queue sheet
- Frameless desktop chrome with native window controls

See [SPEC.md](./SPEC.md) for the original visual design notes.
