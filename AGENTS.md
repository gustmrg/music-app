# AGENTS.md

Local Music is an Electron music player for local files, torrents from the
user's own indexer, and YouTube. The React renderer also supports a limited
browser mode. Read [development](docs/development.md) and the relevant
[architecture decisions](docs/adr/README.md) before changing a boundary.

Write code, comments, commits, PRs, and docs in English. Keep user-facing
text consistent with the existing Brazilian Portuguese interface.

## Architecture

- Keep native and integration code in `electron/`, presentation in `src/`,
  and shared data and IPC types in `shared/`. The renderer must work when
  `window.desktop` is absent, within the documented browser limitations.
- `shared/ipc.ts` is the canonical IPC contract; `shared/types.ts` holds
  shared data types. Update handlers, preload, and callers together. Types
  do not replace main-process validation of renderer input.
- Preserve context isolation, sandboxing, disabled Node integration, and
  trusted-frame checks. Expose specific bridge methods, never unrestricted
  filesystem access or generic IPC. The sandboxed preload imports runtime
  code only from Electron.
- The `local-music://` protocol serves registered track and cover identifiers,
  never arbitrary renderer-supplied file paths. Preserve byte-range handling
  for local files and torrent audio.
- Serialize library mutations through the main-process queue. Keep slow
  indexer searches and torrent metadata work outside that queue.
- Never move, overwrite, edit, or delete imported source files. Tag edits
  belong to the library JSON. Preserve saved data and compatibility with
  older libraries; do not replace a corrupt library with an empty one.
- Keep torrents temporary, with cleanup on eviction, restart, and shutdown.
  Explicit saves may keep a torrent active until completion. Active torrents
  upload as well as download; do not describe streaming as upload-free
  ([ADR 2](docs/adr/0002-stream-only-torrents.md)).
- YouTube lives use yt-dlp and one ffmpeg stream through the existing audio
  element. Pausing closes the stream; resuming returns to the live edge.
  Lives have no fixed duration or seek support. Clean up child processes and
  retry timers on cancellation, track changes, and shutdown
  ([ADR 3](docs/adr/0003-youtube-lives-via-ffmpeg.md)).
- Edit TypeScript sources, not generated `dist/` or `dist-electron/` files.
  Electron sources use `.ts` relative imports and erasable syntax; esbuild
  produces CommonJS bundles. Keep ESM-only dependencies dynamically imported
  ([ADR 4](docs/adr/0004-main-process-in-typescript.md)).

## Change coverage

Check the paths affected by a change: local files, regular YouTube videos,
lives, and torrents; desktop and browser mode; queue and playlist entry
points. Cover loading, playback, pause/resume, seeking where supported,
switching tracks, cancellation, reconnection, and failure where applicable.
Report verification gaps and unsupported behavior.

## Development and tests

- Use Node.js 22.18 or later and npm. CI pins Node.js 24.22.1 to match the
  Electron runtime. Keep `package-lock.json` as the only lockfile.
- `npm run dev` starts Vite and Electron with rebuilds and restarts.
  `npm run dev:web` starts the browser preview. Browser checks cannot verify
  native dialogs, IPC, or the Electron audio protocol.
- Stop only processes whose PIDs you captured when starting them; never use
  `pkill -f` or kill by name/path matching. Do not stop another server to free
  a port. Keep scratch artifacts outside the worktree.
- Use isolated Electron user data, temporary library/cache/save folders, and
  synthetic audio for automated checks. Never test imports, cleanup, or
  persistence against the user's real library, music, or indexer credentials.
- Tests must not contact real indexers, YouTube, or torrent swarms. Inject
  fake network clients and child processes; use local fixtures. Keep manual
  integration checks explicit and report what they exercised.
- Node tests live beside their modules in `electron/*.test.ts` and run
  directly from TypeScript. Run a focused file with
  `node --test electron/live.test.ts`, adapting the filename as needed.
- Reproduce logic bugs with a failing test before fixing them. Extend
  focused tests for behavior changes at the lowest relevant layer; avoid
  assertions that only mirror types, copy, or mock wiring.
- Await events/promises or use controlled clocks instead of hiding races
  with sleeps, retries, or larger timeouts.
- Check UI changes in the running app. Use before/after captures for visual
  fixes and recordings for motion or timing; keep review-only assets out of
  commits. Distinguish simulated media events from real audio playback.

## Quality gates

Before opening a PR, run the same checks as CI:

```sh
npm run typecheck
npm test
npm run build
```

Do not loosen strict TypeScript settings. Follow the surrounding formatting;
the project currently has no lint or format scripts. `npm run dist` builds
installers and is only needed when validating packaging.

## Code and docs

- Follow existing component and module conventions. Reuse the UI components
  in `src/components/ui/` and Lucide icons. Keep playback behavior in the
  player and integration behavior in the main-process services.
- Explain non-obvious constraints and cleanup in comments. Keep interface
  text concise and use accessible labels for icon-only controls.
- Update affected guides in the same PR. Keep documentation in English and
  the English and Portuguese READMEs consistent when changing shared content.
  Add new guides to the README documentation list and use relative links.
- Number new ADRs sequentially in `docs/adr/NNNN-short-title.md` and follow
  the existing sections. Accepted decisions are immutable: add a superseding
  record when changing one and update the status and ADR index.

## Git and pull requests

- Never commit to `main`. Use short branches such as `fix/player-volume`,
  without personal prefixes. Preserve unrelated working-tree changes.
- Follow Conventional Commits for commit messages and PR titles, with a
  scope naming the product area.
- Merge PRs with a merge commit. Use GitHub Stack when available for related
  changes that benefit from separate review.
- PR bodies explain the problem and user-visible result, then relevant
  technical details. Include `## Testing` with check results, test counts,
  app checks, and verification gaps; add `## Not in this PR` when useful.
- Only the **Desktop release** workflow on `main` prepares release versions,
  commits, and tags. Do not bump versions or publish releases as part of an
  ordinary fix. Follow the [release guide](docs/releasing.md).
