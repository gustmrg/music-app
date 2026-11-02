# Local Music — interface scope

## Goal

Access the music and playlists on your own computer. No remote service, account, subscription, ads, social feed, or fictional catalog.

## Layout

- Dark theme with a red accent, keeping the visual identity of the prototype.
- Sidebar: Library, Folders, Playlists, Favorites, and Recents; personal playlists below.
- Top bar: search by track, file, or folder name; open files; add folder; window controls on desktop.
- Content: lists of files or collections of folders/playlists. No invented content when the library is empty.
- Fixed player at the bottom: current track, favorite, volume, real progress, play/pause, previous/next, playback modes, and queue.
- Side panels for the queue and playlist editing, with accessible labels and keyboard navigation.

## Behavior

The library starts empty. Only explicit selections of local files, folders, and playlists add tracks. Adding the same folder does not duplicate references. Folders are grouped by the real location of the files.

Favorites, recents, volume, and playlists persist on desktop. The queue is temporary. Saved playlists can be reordered without changing the queue that is playing. Deleting a playlist or clearing the queue never deletes music files.

In-order playback stops at the end of the queue; repeat queue returns to the start; repeat track restarts the track; shuffle picks another track when more than one is available. Pausing preserves the position. Progress and duration come from the real audio.

Inaccessible files and unsupported formats produce messages, with no demo audio as a substitute. Import ignores remote references and reports the skipped items. In the web preview, the interface says that files last only for the session.

Reading tags, embedded cover art, folder watching, an equalizer, and lyrics are outside this first version. The previous prototype is preserved in the Git history.
