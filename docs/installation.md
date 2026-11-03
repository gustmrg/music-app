# Installation

The installers are on the [Releases](https://github.com/gustmrg/music-app/releases) page. Each release also includes a `SHA256SUMS.txt`.

| System | File | Architecture |
| --- | --- | --- |
| macOS | `local-music-<version>-mac-arm64.dmg` | Apple Silicon, macOS 13 or later |
| Windows | `local-music-<version>-win-x64.exe` | x64 |
| Linux | `local-music-<version>-linux-<arch>.AppImage` or `.deb` | x64 |

To verify a download, run `sha256sum -c SHA256SUMS.txt --ignore-missing` (Linux), `shasum -a 256 -c SHA256SUMS.txt --ignore-missing` (macOS), or compare against `Get-FileHash <file>` (Windows).

## Unsigned app

The installers are **not signed** (no Apple developer certificate and no Windows code signing), and the app is not notarized. The operating systems show a warning the first time you open it. That does not mean the file is broken; only install files downloaded from this repository's Releases page.

### macOS

Gatekeeper blocks the first launch. After dragging **Local Music** to Applications, use one of these options:

- Open the app, dismiss the warning, go to **System Settings → Privacy & Security**, and click **Open Anyway**.
- Or remove the quarantine attribute from the terminal:

  ```bash
  xattr -cr "/Applications/Local Music.app"
  ```

If macOS says the app "is damaged and can't be opened," it is the same block, and the command above fixes it.

### Windows

SmartScreen shows "Windows protected your PC." Click **More info**, then **Run anyway**.

### Linux

- **AppImage:** make the file executable and run it.

  ```bash
  chmod +x local-music-*.AppImage
  ./local-music-*.AppImage
  ```

- **deb:** `sudo apt install ./local-music-*.deb`.

## Updates

The app does not update itself. To update, install the latest release over the previous one. Your library lives in `local-library.json` in the user data directory and is kept.

## YouTube

Importing YouTube links requires [yt-dlp](https://github.com/yt-dlp/yt-dlp) to be installed on your system and available on the `PATH`. The rest of the app works without it.
