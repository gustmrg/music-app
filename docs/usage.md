# Usage

- **Open files** selects individual tracks.
- **Add folder** reads tracks from the folder and its subfolders. Use the button again to find files added later; there is no automatic watching.
- **Library**, **Folders**, **Favorites**, and **Recents** organize the selected files.
- **Playlists** lets you create, rename, pick and remove tracks, reorder, and delete selections. It also imports UTF-8 M3U/M3U8 and exports M3U8 with relative paths.
- The player plays real files, with pause/resume, seeking, volume, previous/next, repeat, and shuffle. In order mode, playback stops at the end of the queue.
- The queue is temporary and independent from playlists. Use **Save playlist** to keep it.
- **YouTube** (desktop) imports YouTube videos and playlists from pasted links, one per line, and creates a playlist when the submission has several videos. It requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed on the system. No video is downloaded: the audio is resolved through yt-dlp when the track starts playing, because stream addresses expire within a few hours.

The original files are never copied, moved, edited, or deleted. The library, favorites, recents, playlists, and volume are stored in `local-library.json` in Electron's `userData` directory. Playback does not resume automatically when the app opens.

## Limits of this version

- Titles come from file names; the folder is shown separately. Artist/album tags and embedded cover art are not read yet.
- Selectable extensions: MP3, WAV, FLAC, OGG, Opus, M4A, AAC, and WebM. Playback depends on the codecs in the Electron version and on the file contents; errors appear in the interface.
- Moved, deleted, or disconnected-disk files stay referenced and fail when played. Add them again from their current location.
- Playlists import only local references, with no streaming URLs or network shares. Older M3U files in another encoding must be converted to UTF-8.
- The same track appears once per playlist. Directory symbolic links are not followed.
- The web preview opens files and folders for the current session only; persistence and M3U import/export are desktop features.
