# Releases

Releases are produced by the [Desktop release](../.github/workflows/release.yml) workflow, which is triggered manually. The installers are not signed; see [Installation](installation.md#unsigned-app).

## Publishing a version

1. Confirm that CI on `main` is green.
2. Go to **Actions → Desktop release → Run workflow**, choose the `main` branch, and enter the version: `patch`, `minor`, `major`, or an exact version such as `0.3.0`.
3. Wait for the jobs to finish. The release appears under **Releases**.

`package.json` stays at `0.0.0` until the first release, and afterwards always at the last published version, because the workflow commits the bump. The first release is `0.1.0`: enter `minor`. After it, `patch` produces `0.1.1`, `minor` produces `0.2.0`, and `major` produces `1.0.0`.

## What the workflow does

1. **version** resolves the version from `package.json`, rejects an existing tag or a prerelease, and finds the previous tag for the release notes.
2. **verify** (`typecheck`, `test`, `build`) and **package** run in parallel. `package` produces a DMG (macOS arm64), NSIS (Windows x64), and AppImage and deb (Linux x64).
3. **release** runs only if both pass. It commits the version bump (`chore(release): prepare v<version>`) to `main`, creates the `v<version>` tag, generates `SHA256SUMS.txt`, creates the release as a draft with automatic notes, uploads the files, and only then publishes it.

If any step fails before the `release` job, nothing is committed or tagged.

## Protecting main

The `release` job pushes the version commit and the tag directly to `main` with the `GITHUB_TOKEN`. If `main` has a ruleset that requires pull requests, that push is rejected. In that case, create a deploy key with write access, add it as a bypass actor of the ruleset, store the private key in the `RELEASE_DEPLOY_KEY` secret, and pass `ssh-key: ${{ secrets.RELEASE_DEPLOY_KEY }}` to the `actions/checkout` step of the `release` job.
