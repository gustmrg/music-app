# Architecture decision records

Each record explains one architectural decision: the context, what was decided, its consequences, and the alternatives that were rejected. Records are not edited after they are accepted. To change a decision, add a new record that supersedes the old one, and set the old one's status to `superseded by N`.

| # | Decision | Status |
|---|---|---|
| [1](0001-electron-with-bundled-chromium.md) | Electron with bundled Chromium | accepted |
| [2](0002-stream-only-torrents.md) | Torrents are stream-only, with no seeding | accepted |
| [3](0003-youtube-lives-via-ffmpeg.md) | YouTube livestreams play through yt-dlp and ffmpeg | accepted (implementation pending) |
| [4](0004-main-process-in-typescript.md) | Main process in TypeScript, bundled to CommonJS | accepted |

New records use the next number and the same sections: Context, Decision, Consequences, Alternatives considered.
