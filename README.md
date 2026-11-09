# Local Music

**English** | [Português (Brasil)](README.pt-BR.md)

A desktop music player built around your own library. Add the audio files already on your computer, find and download albums through your torrent indexer, or stream from YouTube. No account, no subscription, and no built-in catalog: the library starts empty and holds only what you add.

> [!NOTE]
> Personal project in early development (0.x versions). It works, but it still changes a lot.

## What it does

- **Local library:** add files or whole folders (MP3, FLAC, WAV, OGG, Opus, M4A, AAC, and WebM). Added folders are watched, so new, changed, and removed files update the library on their own. Embedded tags and cover art are read on import, so you can browse by Albums, Library, Folders, Favorites, and Recents, with filters by artist, genre, format, and origin.
- **Torrents through your indexer:** **Discover** searches your own Prowlarr or Jackett, streams any track of a result right away, and saves the albums or tracks you want to keep into the library.
- **YouTube:** paste video, playlist, or livestream links and listen by streaming, resolved through yt-dlp the moment a track plays. Livestreams also need ffmpeg.
- **Playlists and queue:** create playlists from selected tracks, reorder them, import and export M3U/M3U8, and save the current queue.
- **Your files stay intact:** imported files are never moved, edited, or deleted; album and tag edits live in the app only.
- **No telemetry:** the library lives in a local file. Network access happens only for YouTube and for the indexer and torrents you configure.

## Installation

Download the installer from the [Releases](https://github.com/gustmrg/music-app/releases) page (macOS arm64, Windows x64, and Linux x64). YouTube requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed on the system, and Discover requires a Prowlarr or Jackett instance.

> [!IMPORTANT]
> The apps are **not signed**. macOS and Windows show a warning the first time you open them; see how to allow the app in [Installation](docs/installation.md#unsigned-app).

> [!WARNING]
> Torrent streams download **and upload** pieces of files to other peers, who can see your IP address. Whether this is legal depends on your country and on the content. You are responsible for what you search, play, and save.

## Roadmap

- Save the audio of YouTube tracks and livestreams into the library.

## Running from source

```bash
npm install
npm run dev          # Vite + Electron
npm test
```

Requires Node.js 22.18 or later (CI uses 24, the version bundled with Electron). See [Development](docs/development.md) for the project layout.

## Documentation

- [Installation](docs/installation.md): downloads, the unsigned app, updates, and YouTube.
- [Usage](docs/usage.md): library, albums, playlists, Discover, YouTube, and current limits.
- [Development](docs/development.md): scripts, project layout, and security.
- [Releases](docs/releasing.md): how to publish a version.
- [Decisions](docs/adr/README.md): architecture decision records.

The documentation is in English. Only the README is also available in Portuguese.

## License

[MIT](LICENSE)
