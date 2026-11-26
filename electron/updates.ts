import { execFile, spawn } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater"
import type { UpdateState, UpdateStatus } from "../shared/types.ts"

// In-app updates through electron-updater and the GitHub release feed
// (latest*.yml); see docs/adr/0006-updates-from-github-releases.md.
const CHECK_FAILED = "Não foi possível verificar atualizações. Verifique a conexão e tente novamente."
const DOWNLOAD_FAILED = "Não foi possível baixar a atualização. Tente novamente."
// quitAndInstall starts shutting the app down at once, so the renderer gets
// this long to receive and paint the "installing" state first.
const INSTALL_PAINT_DELAY_MS = 300

export type UpdateServiceOptions = {
  updater: AppUpdater
  current: string
  // Only packaged builds have an update feed (app-update.yml).
  enabled: boolean
  // False for builds that can only be updated by downloading the release.
  autoInstall: boolean
  // Replaces the updater's own relaunch after a package-manager install.
  relaunchAfterInstall?: () => void
  onChange?: (state: UpdateState) => void
}

export class UpdateService {
  #options: UpdateServiceOptions
  #status: UpdateStatus

  constructor(options: UpdateServiceOptions) {
    this.#options = options
    this.#status = options.enabled ? { status: "idle" } : { status: "unsupported" }
    const { updater } = options
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.allowDowngrade = false
    if (options.relaunchAfterInstall) updater.autoRunAppAfterInstall = false
    updater.on("update-available", (info: UpdateInfo) => {
      this.#set(options.autoInstall ? { status: "available", version: info.version } : { status: "manual", version: info.version })
    })
    updater.on("update-not-available", () => this.#set({ status: "current" }))
    updater.on("download-progress", (progress: ProgressInfo) => {
      if (this.#status.status === "downloading") this.#set({ ...this.#status, percent: Math.round(progress.percent) })
    })
    updater.on("update-downloaded", (info: UpdateInfo) => this.#set({ status: "downloaded", version: info.version }))
    // The updater logs its own long, technical errors to the console; the
    // interface keeps a stable text.
    updater.on("error", () => this.#fail())
  }

  get state(): UpdateState {
    return { ...this.#status, current: this.#options.current }
  }

  async check(): Promise<void> {
    const { status } = this.#status
    if (status === "unsupported" || status === "checking" || status === "downloading" || status === "installing") return
    this.#set({ status: "checking" })
    try { await this.#options.updater.checkForUpdates() }
    catch { this.#fail() }
  }

  async download(): Promise<void> {
    if (this.#status.status !== "available") return
    // A cached download reports no progress, so leave "available" before it starts.
    this.#set({ status: "downloading", version: this.#status.version, percent: 0 })
    try { await this.#options.updater.downloadUpdate() }
    catch { this.#fail() }
  }

  install(): void {
    if (this.#status.status !== "downloaded") return
    this.#set({ status: "installing", version: this.#status.version })
    setTimeout(() => this.#quitAndInstall(), INSTALL_PAINT_DELAY_MS)
  }

  #quitAndInstall() {
    const { updater, relaunchAfterInstall } = this.#options
    if (!relaunchAfterInstall) return updater.quitAndInstall(false, true)
    // The install runs synchronously and reports a failure through the "error"
    // event, in which case the app keeps running and must not start a second copy.
    let failed = false
    const onError = () => { failed = true }
    updater.on("error", onError)
    try { updater.quitAndInstall(false, false) }
    finally { updater.off("error", onError) }
    if (!failed) relaunchAfterInstall()
  }

  // Both the rejected promise and the "error" event report a failure; only the
  // first one changes the state.
  #fail() {
    const status = this.#status
    if (status.status === "checking") this.#set({ status: "failed", message: CHECK_FAILED })
    else if (status.status === "downloading") this.#set({ status: "available", version: status.version, error: DOWNLOAD_FAILED })
    else if (status.status === "installing") this.#set({ status: "downloaded", version: status.version })
  }

  #set(status: UpdateStatus) {
    this.#status = status
    this.#options.onChange?.(this.state)
  }
}

const execFileAsync = promisify(execFile)

// Squirrel.Mac refuses to install updates unless the running bundle and the
// downloaded archive share a real Developer ID signature, so ad-hoc-signed or
// unsigned builds (the current release configuration) can only offer a manual
// download. Windows NSIS, AppImage, and deb install fine without signing.
export async function resolveAutoInstallSupport(
  platform: string,
  execPath: string,
  runCodesign: (bundlePath: string) => Promise<{ ok: boolean; output: string }> = defaultCodesignRunner,
): Promise<boolean> {
  if (platform !== "darwin") return true
  // execPath sits at <bundle>/Contents/MacOS/<binary>; codesign wants the bundle root.
  const bundlePath = path.resolve(execPath, "..", "..", "..")
  let result: { ok: boolean; output: string }
  try { result = await runCodesign(bundlePath) }
  catch { return false }
  if (!result.ok) return false
  return !/TeamIdentifier=not set|Signature=adhoc/.test(result.output)
}

async function defaultCodesignRunner(bundlePath: string): Promise<{ ok: boolean; output: string }> {
  // `codesign -dv` prints its report on stderr and exits non-zero when the
  // bundle has no signature at all.
  try {
    const { stderr } = await execFileAsync("codesign", ["-dv", bundlePath])
    return { ok: true, output: stderr }
  } catch (error) {
    const failure = error as { code?: unknown; stderr?: unknown }
    if (typeof failure.code === "number" && typeof failure.stderr === "string") return { ok: false, output: failure.stderr }
    throw error
  }
}

// Waits for the given process to exit, then starts the app again. The wait keeps
// the new instance from starting while the old one still shuts down.
const WAIT_THEN_EXEC = 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; shift; exec "$@"'

// Starts the app again once this process exits, without `app.relaunch()`. On
// Linux, Electron starts the relaunched process with `no_new_privs` set, so
// pkexec cannot raise privileges from it and the next deb update fails until
// the user reopens the app by hand. A detached shell spawned from this process
// does not carry the flag.
export function relaunchAfterExit(
  pid: number,
  execPath: string,
  args: readonly string[],
  spawner: (command: string, args: string[]) => void = detachedSpawn,
): void {
  spawner("/bin/sh", ["-c", WAIT_THEN_EXEC, "sh", String(pid), execPath, ...args])
}

function detachedSpawn(command: string, args: string[]) {
  spawn(command, args, { detached: true, stdio: "ignore" }).unref()
}
