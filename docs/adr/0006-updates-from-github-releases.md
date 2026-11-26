# 6. In-app updates through electron-updater and GitHub releases

- Status: accepted
- Date: 2026-11-26

## Context

Until now the app did not check for updates: users had to visit the Releases page, pick the right file, and install it over the previous version. Releases are produced by the Desktop release workflow, which publishes a DMG (macOS arm64), an NSIS installer (Windows x64), an AppImage and a deb (Linux x64), and a `SHA256SUMS.txt`.

The installers are not signed. electron-updater installs updates in place for NSIS, AppImage, and deb without a signature: without a `publisherName` it checks the download against the SHA-512 in the release's update feed. On macOS it installs through Squirrel.Mac, which refuses bundles without a Developer ID signature. Wisp Bot, another project by the same maintainer, already ships unsigned updates this way.

## Decision

1. Use `electron-updater`, pinned to an exact version, with the GitHub provider. The `publish` config in `package.json` makes electron-builder write `app-update.yml` into the app and the update feed (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`, and `.blockmap` files) next to the installers. The release workflow keeps `--publish never` and uploads the feed with the installers. macOS also builds a ZIP, which is the update payload electron-updater expects there.
2. **Settings → Updates** has a **Verificar atualizações** button. The app never checks on its own, and downloads only after the user clicks **Baixar atualização** (`autoDownload` is off). **Reiniciar e instalar** quits and installs; a downloaded update also installs when the app quits. Downgrades are disabled.
3. Only packaged builds update; development builds show that updates are unavailable.
4. On macOS, `codesign -dv` tells whether the running bundle has a real signature. Ad-hoc or unsigned builds, which is what the workflow produces today, show the new version and open its release page instead of downloading it.
5. deb, rpm, and pacman updates install through pkexec. Electron's `app.relaunch()` starts the new process with `no_new_privs`, which would make the next package update fail, so after those installs the app starts again from a detached shell that waits for the old process to exit.
6. The main process owns the update state and broadcasts it. The renderer sends commands without arguments; the release page it can open is fixed.

## Consequences

- Windows, AppImage, and deb users update in place. macOS users still download the DMG by hand until the app is signed.
- Each release has more files: the macOS ZIP, three feed files, and the block maps. `SHA256SUMS.txt` covers all of them.
- The feed's SHA-512 and `SHA256SUMS.txt` come from the same release, so they protect against corrupted downloads, not against a compromised release. Trust rests on GitHub and HTTPS, as it does for a manual download.
- The repository is fixed in the build configuration. Forks that publish their own releases need to change it.
- Version 0.1.0 has no updater and its release has no feed; its users install the next version by hand.
- electron-updater's own logs go to the console; the interface shows short, stable messages.

## Alternatives considered

- **Download the installer and let the user run it.** No new dependency or release files, and the same flow on every system, but nothing installs in place, and on Linux the user installs the deb or swaps the AppImage by hand.
- **Check on startup.** Finds updates sooner, but makes a request to GitHub on every launch without the user asking.
- **Only link to the Releases page.** No update code, but the user still picks the right file for their system.
