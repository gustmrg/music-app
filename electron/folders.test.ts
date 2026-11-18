import { test } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { FolderWatchers } from "./folders.ts"
import type { Watch } from "./folders.ts"
import { isWithin } from "./library.ts"

type FakeWatcher = { folder: string; emit: (filename: string | null) => void; fail: (error: Error) => void; closed: boolean }

// A watch function that records watchers so tests can emit events by hand.
function fakeWatch(unavailable = new Set<string>()) {
  const watchers: FakeWatcher[] = []
  const watch: Watch = (folder, listener) => {
    if (unavailable.has(folder)) throw Object.assign(new Error(`ENOENT: ${folder}`), { code: "ENOENT" })
    const errors: ((error: Error) => void)[] = []
    const watcher = {
      folder, closed: false,
      emit: (filename: string | null) => listener("rename", filename),
      fail: (error: Error) => { for (const handler of errors) handler(error) },
      close() { watcher.closed = true },
      on(_event: "error", handler: (error: Error) => void) { errors.push(handler); return watcher },
    }
    watchers.push(watcher)
    return watcher
  }
  return { watch, watchers, unavailable }
}

function setup(t: TestContext, options: { exists?: (folder: string) => Promise<boolean>; unavailable?: Set<string> } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const fake = fakeWatch(options.unavailable)
  const changes: [string, string[]][] = []
  const watchers = new FolderWatchers({ watch: fake.watch, exists: options.exists ?? (async () => true), onChange: (folder, scopes) => changes.push([folder, scopes]) })
  t.after(() => watchers.close())
  return { ...fake, changes, folders: watchers }
}

const root = path.join(path.sep, "music")

test("reports a burst of events once, after a quiet period, as the outermost changed folders", (t) => {
  const { watchers, changes, folders } = setup(t)
  folders.sync([root])
  const [watcher] = watchers
  for (const name of ["Álbum/01.mp3", "Álbum/02.mp3", "Álbum/cover.jpg", path.join("Outro", "Disco 1", "01.flac"), path.join("Outro", "Disco 1")]) {
    watcher.emit(name)
    t.mock.timers.tick(500)
  }
  // The last event was 500 ms ago; the report comes 2 s after it.
  assert.deepEqual(changes, [])
  t.mock.timers.tick(1499)
  assert.deepEqual(changes, [])
  t.mock.timers.tick(1)
  assert.deepEqual(changes, [[root, [path.join(root, "Álbum"), path.join(root, "Outro")]]])
})

test("reports at most every 30 seconds while events keep arriving", (t) => {
  const { watchers, changes, folders } = setup(t)
  folders.sync([root])
  for (let second = 0; second < 40; second++) {
    watchers[0].emit("Downloads/album.part")
    t.mock.timers.tick(1000)
  }
  assert.equal(changes.length, 1)
  assert.deepEqual(changes[0], [root, [path.join(root, "Downloads")]])
})

test("treats events without a file name as a change to the whole folder", (t) => {
  const { watchers, changes, folders } = setup(t)
  folders.sync([root])
  watchers[0].emit(null)
  t.mock.timers.tick(2000)
  assert.deepEqual(changes, [[root, [root]]])
})

test("stops watching removed folders and drops their pending changes", (t) => {
  const { watchers, changes, folders } = setup(t)
  const other = path.join(path.sep, "other")
  folders.sync([root, other])
  watchers[0].emit("a.mp3")
  folders.sync([other])
  t.mock.timers.tick(5000)
  assert.equal(watchers[0].closed, true)
  assert.equal(watchers[1].closed, false)
  assert.deepEqual(changes, [])
  assert.deepEqual(folders.folders, [other])
  // Syncing the same list again does not open a second watcher.
  folders.sync([other])
  assert.equal(watchers.length, 2)
})

test("watches again a folder that failed or was missing, then reconciles all of it", (t) => {
  const unavailable = new Set([root])
  const { watchers, changes, folders } = setup(t, { unavailable })
  folders.sync([root])
  assert.equal(watchers.length, 0)
  t.mock.timers.tick(60_000)
  assert.equal(watchers.length, 0, "still missing")
  unavailable.clear()
  t.mock.timers.tick(60_000)
  assert.equal(watchers.length, 1)
  t.mock.timers.tick(2000)
  assert.deepEqual(changes, [[root, [root]]])

  watchers[0].fail(new Error("ENOSPC"))
  assert.equal(watchers[0].closed, true)
  t.mock.timers.tick(60_000)
  assert.equal(watchers.length, 2)
})

test("closes the watcher when the watched folder itself disappears", async (t) => {
  let exists = true
  const { watchers, folders } = setup(t, { exists: async () => exists })
  t.mock.method(console, "warn", () => {})
  folders.sync([root])
  exists = false
  watchers[0].emit("")
  // Let the existence check settle.
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(watchers[0].closed, true)
  exists = true
  t.mock.timers.tick(60_000)
  assert.equal(watchers.length, 2)
})

test("restarts a watcher that reports the watched folder by its absolute path", (t) => {
  const { watchers, changes, folders } = setup(t)
  folders.sync([root])
  // Windows does this, endlessly, once the watched folder is deleted.
  for (let i = 0; i < 1000; i++) watchers[0].emit(path.resolve(root))
  assert.equal(watchers[0].closed, true)
  t.mock.timers.tick(30_000)
  assert.deepEqual(changes, [])
  t.mock.timers.tick(30_000)
  assert.equal(watchers.length, 2)
  // Late events from the old watcher do not affect the new one.
  watchers[0].emit(path.resolve(root))
  assert.equal(watchers[1].closed, false)
  t.mock.timers.tick(2000)
  assert.deepEqual(changes, [[root, [root]]])
})

// Collects reports from real watchers so a test can await the next one.
function reports() {
  const pending: [string, string[]][] = []
  let wake = () => {}
  return {
    onChange: (folder: string, scopes: string[]) => { pending.push([folder, scopes]); wake() },
    async next(): Promise<[string, string[]]> {
      while (!pending.length) await new Promise<void>((resolve) => { wake = resolve })
      return pending.shift()!
    },
  }
}

async function realFolder(t: TestContext) {
  const folder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "local-music-watch-")))
  t.after(() => fs.rm(folder, { recursive: true, force: true }))
  return folder
}

test("detects files copied into a real folder", async (t) => {
  const folder = await realFolder(t)
  await fs.mkdir(path.join(folder, "Álbum"))
  const { onChange, next } = reports()
  const watchers = new FolderWatchers({ debounceMs: 50, onChange })
  t.after(() => watchers.close())
  watchers.sync([folder])
  const file = path.join(folder, "Álbum", "01.mp3")
  await fs.writeFile(file, "audio")
  const [changed, scopes] = await next()
  assert.equal(changed, folder)
  // Windows also reports the album folder itself, so the scope can be wider.
  assert.ok(scopes.some((scope) => isWithin(scope, file)), `${scopes.join(", ")} should cover ${file}`)
})

test("detects files in a real folder that was deleted and created again", { skip: process.platform !== "win32" && "reproduces Windows fs.watch behavior", timeout: 20_000 }, async (t) => {
  const folder = await realFolder(t)
  const { onChange, next } = reports()
  const watchers = new FolderWatchers({ debounceMs: 50, retryMs: 100, onChange })
  t.after(() => watchers.close())
  watchers.sync([folder])
  await fs.rm(folder, { recursive: true })
  await fs.mkdir(folder)
  // Once watched again, the whole folder is reconciled.
  while (!(await next())[1].includes(folder)) { /* reports from the deletion */ }
  const file = path.join(folder, "01.mp3")
  await fs.writeFile(file, "audio")
  const [, scopes] = await next()
  assert.ok(scopes.some((scope) => isWithin(scope, file)), `${scopes.join(", ")} should cover ${file}`)
})
