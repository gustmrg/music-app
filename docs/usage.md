# Usage

- **Open files** selects individual tracks.
- **Add folder** reads tracks from the folder and its subfolders. Use the button again to find files added later; there is no automatic watching.
- The sidebar groups **Listen** (Library, Albums, Recents, Favorites, Discover) and **Organize** (Playlists, Folders).
- Tags embedded in the files (title, artist, album artist, album, track and disc number, year, genre, duration, and cover art) are read on import and cached in the library, so files are not read again on startup. Libraries saved by older versions are scanned once in the background.
- **Albums** groups tracks by album and album artist (or, without an album artist, by album and folder).
- **Library** has filters for artist, genre, format, origin, and favorites, and sorts by title, artist, album, recently added, or duration.
- Select tracks with the checkboxes (Shift+click selects a range) to play them, add them to the queue or a playlist, create a playlist, favorite them, or **Edit album and tags**. Edits are stored in the app only, can be restored to the file tags, and never rewrite the audio files.
- **Playlists** lets you create, rename, pick and remove tracks, reorder, and delete selections. It also imports UTF-8 M3U/M3U8 and exports M3U8 with relative paths.
- The player plays real files, with pause/resume, seeking, volume, previous/next, repeat, and shuffle. In order mode, playback stops at the end of the queue.
- The queue is temporary and independent from playlists. Use **Save playlist** to keep it.
- **YouTube** (desktop) imports YouTube videos and playlists from pasted links, one per line, and creates a playlist when the submission has several videos. It requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed on the system. No video is downloaded: the audio is resolved through yt-dlp when the track starts playing, because stream addresses expire within a few hours.

The original files are never copied, moved, edited, or deleted. The library (including cached tags), favorites, recents, playlists, tag edits, and volume are stored in `local-library.json`, and cover art in the `covers` folder, in Electron's `userData` directory. Playback does not resume automatically when the app opens.

## Limits of this version

- Titles come from the title tag, or from the file name when there is none. Tags changed in another program are picked up when the folder or files are added again.
- Selectable extensions: MP3, WAV, FLAC, OGG, Opus, M4A, AAC, and WebM. Playback depends on the codecs in the Electron version and on the file contents; errors appear in the interface.
- Moved, deleted, or disconnected-disk files stay referenced and fail when played. Add them again from their current location.
- Playlists import only local references, with no streaming URLs or network shares. Older M3U files in another encoding must be converted to UTF-8.
- The same track appears once per playlist. Directory symbolic links are not followed.
- The web preview opens files and folders for the current session only; persistence and M3U import/export are desktop features.
