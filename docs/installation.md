# Installation

The installers are on the [Releases](https://github.com/gustmrg/playmio/releases) page. Each release also includes a `SHA256SUMS.txt`.

| System | File | Architecture |
| --- | --- | --- |
| macOS | `playmio-<version>-mac-arm64.dmg` | Apple Silicon, macOS 13 or later |
| Windows | `playmio-<version>-win-x64.exe` | x64 |
| Linux | `playmio-<version>-linux-<arch>.AppImage` or `.deb` | x64 |

To verify a download, run `sha256sum -c SHA256SUMS.txt --ignore-missing` (Linux), `shasum -a 256 -c SHA256SUMS.txt --ignore-missing` (macOS), or compare against `Get-FileHash <file>` (Windows).

## Unsigned app

The installers are **not signed** (no Apple developer certificate and no Windows code signing), and the app is not notarized. The operating systems show a warning the first time you open it. That does not mean the file is broken; only install files downloaded from this repository's Releases page.

### macOS

Gatekeeper blocks the first launch. After dragging **Playmio** to Applications, use one of these options:

- Open the app, dismiss the warning, go to **System Settings → Privacy & Security**, and click **Open Anyway**.
- Or remove the quarantine attribute from the terminal:

  ```bash
  xattr -cr "/Applications/Playmio.app"
  ```

If macOS says the app "is damaged and can't be opened," it is the same block, and the command above fixes it.

### Windows

SmartScreen shows "Windows protected your PC." Click **More info**, then **Run anyway**.

### Linux

- **AppImage:** make the file executable and run it.

  ```bash
  chmod +x playmio-*.AppImage
  ./playmio-*.AppImage
  ```

- **deb:** `sudo apt install ./playmio-*.deb`.

## Updates

The app does not update itself. To update, install the latest release over the previous one. Your library lives in `local-library.json` in the user data directory and is kept.

## YouTube

Importing YouTube links requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) to be installed on your system and available on the `PATH`. Livestreams also need [ffmpeg](https://ffmpeg.org) on the `PATH` (for example `sudo apt install ffmpeg` or `brew install ffmpeg`), which turns the stream into audio the player can use. The rest of the app works without either.

### Keep yt-dlp up to date

YouTube changes how it serves video often, and yt-dlp releases fixes within days. An outdated yt-dlp is the most common reason YouTube tracks that used to play start failing: playback may stop right away, fail to load, or report that no format is available. When a YouTube track fails, the app suggests updating yt-dlp.

Update it with the same tool you installed it with:

| Installed with | Update command |
| --- | --- |
| Standalone binary from the yt-dlp releases | `yt-dlp -U` |
| pipx | `pipx upgrade yt-dlp` |
| pip | `python3 -m pip install -U yt-dlp` |
| Homebrew | `brew upgrade yt-dlp` |
| winget | `winget upgrade yt-dlp` |

Linux distribution packages (`apt`, `dnf`) often lag behind; if updating through them does not help, install yt-dlp with pipx or the standalone binary instead. Check the installed version with `yt-dlp --version`. You do not need to restart the app after updating: playing the failed track again asks yt-dlp for a new stream.

## Indexer (Discover)

**Discover** searches your own torrent indexer manager. Playmio does not bundle, install, or run an indexer for you — you run **Prowlarr** or **Jackett** (or another Torznab-compatible service) separately on your computer or local network, and connect Playmio to it. The local library, player, and YouTube work without an indexer.

### Prowlarr vs. Jackett (Torznab)

Both translate searches across the torrent indexers you add to them:

- **[Prowlarr](https://prowlarr.com)** ([GitHub](https://github.com/Prowlarr/Prowlarr)) — **recommended if you are starting from scratch.** Modern interface from the *\*arr* ecosystem. Playmio uses Prowlarr's native API (`/api/v1/search`), which queries all active torrent indexers at once and deduplicates results by info hash.
- **[Jackett](https://github.com/Jackett/Jackett) / Torznab** — older project focused on exposing torrent indexers through the standard Torznab XML API. In Playmio, the **Torznab (Jackett)** mode works with Jackett's aggregate `all` feed as well as any other Torznab-compatible endpoint.

### Setup steps

1. **Install and start the service** using its native installer or Docker:
   - Prowlarr listens on `http://localhost:9696` by default.
   - Jackett listens on `http://localhost:9117` by default.
2. **Add at least one torrent indexer** in its web dashboard:
   - In Prowlarr: **Indexers → Add Indexer**.
   - In Jackett: **Add indexer**.
3. **Copy the address and API key:**
   - **Prowlarr:** use the base address (`http://localhost:9696`) and copy the key from **Settings → General → Security → API Key**.
   - **Jackett:** use the aggregate Torznab endpoint (`http://localhost:9117/api/v2.0/indexers/all/results/torznab/`) and copy the API key shown at the top of the dashboard.
4. **Connect in Playmio:** open **Settings → Indexer**, choose **Prowlarr** or **Torznab (Jackett)**, paste the address and API key, optionally adjust categories (default `3000` for Audio; `3000,3010,3040` for MP3 and FLAC), click **Testar conexão**, and save.

### Out of Playmio's scope

Playmio only talks to the indexer API you configure. Choosing trackers, solving Cloudflare challenges (which may require configuring FlareSolverr inside Prowlarr or Jackett), and keeping the indexer service running are managed outside Playmio.
