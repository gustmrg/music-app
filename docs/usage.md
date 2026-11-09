# Usage

## Principles

- The library starts empty. Only files, folders, playlists, links, and torrents you explicitly add go into it, and adding the same folder twice does not duplicate tracks.
- There is no built-in catalog and no demo content: empty views say so instead of showing placeholders, and failures show a message instead of substitute audio.
- Deleting a playlist or clearing the queue never deletes music files.

## Library and player

- **Open files** selects individual tracks.
- **Add folder** reads tracks from the folder and its subfolders and keeps watching it (desktop). Files copied into a watched folder appear within a few seconds, with tags and cover art; files whose tags change are read again; changes made while the app was closed are picked up when it opens. Adding a folder inside a watched one does not add a second watch.
- **Folders** lists the watched folders. **Parar de monitorar** stops watching one and keeps its tracks. A deleted file, or one on a disconnected disk, stays in the library, playlists, and favorites marked **Indisponível**, and returns to normal when the file comes back. A file renamed or moved inside watched folders keeps its favorites, playlists, and tag edits. **Remover indisponíveis** removes unavailable tracks from the library (and from playlists and favorites) after a confirmation; no file is deleted. See [ADR 5](adr/0005-watched-folders-keep-missing-tracks.md).
- The sidebar groups **Listen** (Library, Albums, Recents, Favorites, Discover) and **Organize** (Playlists, Folders).
- Tags embedded in the files (title, artist, album artist, album, track and disc number, year, genre, duration, and cover art) are read on import and cached in the library, so files are not read again on startup. Libraries saved by older versions are scanned once in the background.
- **Albums** groups tracks by album and album artist (or, without an album artist, by album and folder).
- Use the **List/Grid** buttons above the tracks to switch layouts in Library, Favorites, Recents, and inside albums, folders, and playlists. The desktop app remembers the chosen layout.
- Hover over a track’s cover to reveal play/pause; pausing and resuming keeps the playback position. Track numbers stay visible. The cover control follows the player’s playback state and also works with keyboard focus.
- **Settings** at the bottom of the sidebar opens a dialog with a side menu for **Storage** and **Indexer**. In Storage, choose a folder for new Discover downloads; the choice is saved automatically. Existing files remain in their original locations.
- **Library** has filters for artist, genre, format, origin, and favorites, and sorts by title, artist, album, recently added, or duration.
- Select tracks with the checkboxes (Shift+click selects a range) to play them, add them to the queue or a playlist, create a playlist, favorite them, or **Edit album and tags**. Edits are stored in the app only, can be restored to the file tags, and never rewrite the audio files.
- **Playlists** lets you create, rename, pick and remove tracks, reorder, and delete selections. It also imports UTF-8 M3U/M3U8 and exports M3U8 with relative paths.
- The player plays real files, with pause/resume, seeking, volume, previous/next, repeat, and shuffle. In order mode, playback stops at the end of the queue.
- The queue is temporary and independent from playlists. Use **Save playlist** to keep it.
- **YouTube** (desktop) imports YouTube videos and playlists from pasted links, one per line, and creates a playlist when the submission has several videos. It requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed on the system. No video is downloaded: the audio is resolved through yt-dlp when the track starts playing, because stream addresses expire within a few hours.
- **YouTube livestreams** (desktop) play from a video link or a channel's live page (`https://www.youtube.com/@channel/live`). The player shows **Ao vivo** instead of a seek bar. Pausing stops the stream, and resuming returns to the live moment. A dropped stream reconnects on its own, and the player never skips to the next track because a live ended. Livestreams need [ffmpeg](https://ffmpeg.org) installed.

- **Discover** (desktop) searches your own Prowlarr or Torznab endpoint (such as Jackett), configured per provider in **Settings → Indexer**. Click a result to expand its audio files, and click it again to collapse. Reopening reuses the loaded metadata. Expanding a result fetches metadata only; audio downloads start when you explicitly play or save. The search text, results, and expanded items remain available when you navigate to another screen and back during the session. Use the refresh button next to Search to query again with the current input. **Parar todos os torrents** stops every active torrent, including pending album saves; **Parar download** beside an album’s actions stops only that torrent. Already saved tracks remain in the library. Play the album or any track by streaming, or save them into the music save folder (default `~/Music/Local Music`), after which they are imported into the library. Torrents are stopped and their cache removed when playback moves on; nothing is seeded afterwards.

The original files are never copied, moved, edited, or deleted. The library (including cached tags), favorites, recents, playlists, tag edits, display mode, save folder, and volume are stored in `local-library.json`, and cover art in the `covers` folder, in Electron's `userData` directory. Playback does not resume automatically when the app opens.

## Limits of this version

- Titles come from the title tag, or from the file name when there is none. Tags changed in another program are picked up automatically in watched folders, and otherwise when the files are added again.
- Selectable extensions: MP3, WAV, FLAC, OGG, Opus, M4A, AAC, and WebM. Playback depends on the codecs in the Electron version and on the file contents; errors appear in the interface.
- Files opened individually (outside a watched folder) are not watched: if they are moved or deleted, they stay referenced and fail when played. Add them again from their current location.
- Folders added before watching existed are not watched until you add them again; their tracks are not duplicated.
- A file that is copied (rather than moved) to replace a deleted one usually gets a new modification time and is imported as a new track.
- Playlists import only local references, with no streaming URLs or network shares. Older M3U files in another encoding must be converted to UTF-8.
- The same track appears once per playlist. Directory symbolic links are not followed.
- The web preview opens files and folders for the current session only; persistence and M3U import/export are desktop features.
