# Local Music

**English** | [Português (Brasil)](README.pt-BR.md)

A desktop music player for what is already yours: the files on your computer and the YouTube links you paste. No account, no subscription, no recommendations, and no third-party catalog. Your library starts empty and only holds what you choose to add.

> [!NOTE]
> Personal project in early development (0.x versions). It works, but it still changes a lot.

## What it does

- **Local library:** add files or whole folders (MP3, FLAC, WAV, OGG, Opus, M4A, AAC, and WebM) and browse them by Library, Folders, Favorites, and Recents.
- **Your own playlists:** create, reorder, and export to M3U8; import the M3U/M3U8 files you already have.
- **Full player and queue:** seeking, volume, repeat, shuffle, and a temporary queue you can save as a playlist.
- **YouTube without downloads:** paste video or playlist links and listen by streaming, resolved the moment a track plays.
- **Your files stay intact:** nothing is copied, moved, edited, or deleted.
- **Private by default:** everything lives in a local file, with no remote service or telemetry.

## Installation

Download the installer from the [Releases](https://github.com/gustmrg/music-app/releases) page (macOS arm64, Windows x64, and Linux x64).

> [!IMPORTANT]
> The apps are **not signed**. macOS and Windows show a warning the first time you open them; see how to allow the app in [Installation](docs/installation.md#unsigned-app).

## Running from source

```bash
npm install
npm run dev          # Vite + Electron
npm test
```

Requires Node.js 22 or later. Changes go in through pull requests.

## Direction

The goal is to be a simple, fast local player. Left out of the first version, and the natural candidates for what comes next: automatic folder watching, an equalizer, and lyrics. The full scope is in the [SPEC](SPEC.md).

## Documentation

- [Installation](docs/installation.md): downloads, the unsigned app, updates, and YouTube.
- [Usage](docs/usage.md): library, playlists, queue, YouTube, and the limits of this version.
- [Development](docs/development.md): scripts, project layout, and security.
- [Releases](docs/releasing.md): how to publish a version.
- [SPEC](SPEC.md): scope of the interface and behavior.

The documentation is in English. Only the README is also available in Portuguese.
