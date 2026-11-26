import test from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import type { AppUpdater } from "electron-updater"
import { UpdateService, resolveAutoInstallSupport } from "./updates.ts"
import type { UpdateServiceOptions } from "./updates.ts"

// Stands in for electron-updater, which reports a failure both through the
// "error" event and by rejecting the call.
class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  allowDowngrade = true
  autoRunAppAfterInstall = true
  downloads = 0
  installs: [boolean, boolean][] = []
  failDownload = false
  failInstall = false

  async checkForUpdates() {
    this.emit("update-available", { version: "0.2.0" })
  }

  async downloadUpdate() {
    this.downloads++
    if (!this.failDownload) return this.emit("update-downloaded", { version: "0.2.0" })
    const error = new Error("net::ERR_CONNECTION_RESET")
    this.emit("error", error)
    throw error
  }

  quitAndInstall(silent: boolean, runAfter: boolean) {
    this.installs.push([silent, runAfter])
    if (this.failInstall) this.emit("error", new Error("pkexec failed"))
  }
}

function service(options: Partial<UpdateServiceOptions> = {}) {
  const updater = new FakeUpdater()
  const statuses: string[] = []
  const updates = new UpdateService({
    updater: updater as unknown as AppUpdater,
    current: "0.1.0",
    enabled: true,
    autoInstall: true,
    onChange: (state) => statuses.push(state.status),
    ...options,
  })
  return { updater, updates, statuses }
}

test("a failed download returns to the available version so it can be retried", async () => {
  const { updater, updates, statuses } = service()
  updater.failDownload = true
  await updates.check()
  await updates.download()
  assert.equal(updates.state.status, "available")
  assert.ok(updates.state.status === "available" && updates.state.error)
  assert.deepEqual(statuses, ["checking", "available", "downloading", "available"])

  updater.failDownload = false
  await updates.download()
  assert.equal(updates.state.status, "downloaded")
})

test("unsigned macOS builds point to the release page and never download", async () => {
  const { updater, updates } = service({ autoInstall: false })
  await updates.check()
  assert.deepEqual(updates.state, { status: "manual", version: "0.2.0", current: "0.1.0" })
  await updates.download()
  assert.equal(updater.downloads, 0)
})

test("a package-manager install relaunches the app only when it succeeds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  let relaunches = 0
  const { updater, updates } = service({ relaunchAfterInstall: () => relaunches++ })
  await updates.check()
  await updates.download()

  updater.failInstall = true
  updates.install()
  t.mock.timers.tick(300)
  assert.equal(relaunches, 0)
  assert.equal(updates.state.status, "downloaded")

  updater.failInstall = false
  updates.install()
  t.mock.timers.tick(300)
  assert.equal(relaunches, 1)
  // The updater must not start the app itself as well.
  assert.deepEqual(updater.installs.at(-1), [false, false])
})

test("only a real macOS signature allows installing in place", async () => {
  const codesign = (output: string, ok = true) => async () => ({ ok, output })
  const app = "/Applications/Playmio.app/Contents/MacOS/Playmio"
  assert.equal(await resolveAutoInstallSupport("win32", "C:/Playmio/Playmio.exe"), true)
  assert.equal(await resolveAutoInstallSupport("darwin", app, codesign("Signature=adhoc")), false)
  assert.equal(await resolveAutoInstallSupport("darwin", app, codesign("TeamIdentifier=not set")), false)
  assert.equal(await resolveAutoInstallSupport("darwin", app, codesign("code object is not signed at all", false)), false)
  assert.equal(await resolveAutoInstallSupport("darwin", app, async () => { throw new Error("codesign missing") }), false)
  assert.equal(await resolveAutoInstallSupport("darwin", app, codesign("Authority=Developer ID Application\nTeamIdentifier=ABCDE12345")), true)
})
