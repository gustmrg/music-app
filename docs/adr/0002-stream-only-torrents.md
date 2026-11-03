# 2. Torrents are stream-only, with no seeding

- Status: accepted
- Date: 2026-11-02

## Context

Discover searches the user's own Prowlarr or Torznab indexer and plays tracks straight from the resulting torrents, using `webtorrent` in the main process (`electron/torrent.cjs`). The bytes reach the player through the same `local-music://` range protocol used for local files, so seeking works before a download finishes.

A torrent client normally keeps everything it downloads and keeps seeding it for as long as it runs. That fits a download manager. It does not fit a music player:

- **Legal exposure.** While a torrent is active, the client uploads pieces to other peers, who can see the user's IP address. Every extra minute of seeding is exposure the user did not ask for just by pressing play.
- **Disk.** Music torrents are usually whole albums, sometimes in lossless formats. A cache that grows with every album sampled would quietly fill the disk.
- **Intent.** Playing a track is not the same as wanting to keep it. Keeping something should be an explicit action.

## Decision

Torrents exist only while they are needed for playback or for an explicit save.

1. **One active torrent for playback.** Preparing a track from a new torrent destroys every other torrent and deletes its cached data (`TorrentEngine.retainOnly`).
2. **Short eviction.** A sweeper destroys any torrent that no longer backs a queued or playing track and has been idle for 10 seconds (`EVICTION_GRACE_MS`). Its folder in the cache is deleted.
3. **Nothing survives a restart.** The cache directory is wiped on startup (`resetCache`), so nothing from a previous session is ever seeded again. Quitting destroys the engine.
4. **Saving is the only way to keep data.** "Save to library" pins a torrent until the selected audio files are complete, copies them to the music save folder through a `.part` file and an atomic rename, imports them with `library.addFiles`, and then releases the torrent like any other. The saved copy is an ordinary local file and is never seeded.
5. **Download and upload are not split.** While a torrent is active it takes part in the swarm normally, uploading as well as downloading. The policy limits *how long* that happens; it does not make streaming upload-free. The README states this, and that legality depends on the country and the content.

## Consequences

- The disk footprint is bounded by the album currently playing plus any saves in progress, with no size setting to tune.
- Returning to an album that was played earlier downloads it again. Sampling many albums costs more bandwidth than a persistent cache would.
- The app gives back to swarms only while streaming, so it is a weak peer. That is acceptable for a player and is documented.
- Saves are the one place where a torrent can live longer. A failure or cancellation leaves no partial files, because unfinished copies are `.part` files that get removed.
- The policy lives entirely in `TorrentEngine`. If the engine is ever replaced, the replacement has to implement the same rules behind the same IPC.

## Alternatives considered

- **Persistent cache with LRU eviction and a size limit.** Replaying an album would be faster, but data would outlive playback and could end up seeded across sessions. That is exactly the exposure this decision avoids.
- **Seed to a ratio or for a fixed time after playback.** This is the polite convention in torrent communities, but it means uploading when the user is no longer listening. It conflicts with "you only take part in a swarm while you use it."
- **Download the whole album before playing.** Simpler to reason about, but it removes instant playback, the reason Discover exists, and still leaves files to clean up.
