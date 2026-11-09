# 5. Watched folders keep tracks whose files disappear

- Status: accepted
- Date: 2026-11-09

## Context

**Add folder** used to scan a folder once. Files added later appeared only after adding the folder again, and the library did not record which folders the user had added: each track only had `folder = path.dirname(file)`.

Watching folders raises a question the one-time scan never had: what happens to a track when its file disappears? A file can be deleted, renamed, or moved to another folder, or the disk it lives on can be unmounted. Track ids are a hash of the file path, and favorites, recents, playlists, and in-app tag edits all point at those ids. Removing a track silently would drop it from every playlist, and an unmounted disk would empty the library.

## Decision

1. Store the added folders in `local-library.json` as `watchedFolders`, canonical and without nested duplicates. **Add folder** adds to the list; the **Folders** screen can stop watching a folder, which keeps its tracks.
2. Watch each folder in the main process with `fs.watch(folder, { recursive: true })`, which is recursive on macOS, Windows, and Linux in the Node.js bundled with Electron. Events are collected per folder and handled after 2 seconds without new events (at most every 30 seconds while events keep coming).
3. Handle a batch by reconciling the parent folders of the changed paths with the disk, through the library mutation queue. On startup, reconcile every watched folder once to pick up changes made while the app was closed.
4. Reconciling imports new files, reads tags again for files whose size or modification time changed, and marks files that are gone as **missing**. Missing tracks stay in the library, playlists, and favorites, and return to normal when the file comes back.
5. A new file with the same size, modification time, and format as exactly one missing track is treated as that track renamed or moved: the new track takes over its favorites, recents, playlists, tag edits, and date added, and the old entry goes away. The main process sends the id change to the renderer, which holds the preferences it saves.
6. Do nothing while a watched folder is unreachable, and do not mark tracks inside subfolders that cannot be read. A watcher that fails or loses its folder is restarted every 60 seconds, followed by a full reconcile.
7. Missing tracks leave the library only when the user asks, from the **Folders** screen, after a confirmation. Files on disk are never touched.

## Consequences

- An unmounted disk, a deleted file, and a renamed file never break a playlist without the user seeing it: the entry stays and shows as unavailable.
- Tracks store `size` and `modifiedAt`. Tracks saved by older versions get them on the first reconcile without being read again.
- Libraries saved before this version have no watched folders. Adding a folder again starts watching it without duplicating tracks.
- Copying a file (instead of moving it) usually changes its modification time, so a copy that replaces a deleted file is imported as a new track.
- If a disk's mount point stays as an empty folder after unmounting, its tracks are marked missing (not removed), and they recover on the next reconcile after the disk returns, at the latest when the app starts.
- Each event reconciles only the affected parent folder, but a change reported without a file name reconciles the whole watched folder.

## Alternatives considered

- **Remove tracks whose files disappear.** Simple, but a rename or an unmounted disk would silently drop tracks from playlists and favorites.
- **chokidar.** Handles more edge cases, but adds a dependency for behavior the built-in recursive `fs.watch` already covers on the three supported platforms.
- **Periodic full rescans.** Simpler than watching, but slow to notice changes and expensive on large libraries.
