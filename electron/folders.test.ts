import { test } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { FolderWatchers } from "./folders.ts"
import type { Watch } from "./folders.ts"

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

test("detects files copied into a real folder", async (t) => {
  const folder = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "local-music-watch-")))
  t.after(() => fs.rm(folder, { recursive: true, force: true }))
  await fs.mkdir(path.join(folder, "Álbum"))
  let report: (value: [string, string[]]) => void = () => {}
  const reported = new Promise<[string, string[]]>((resolve) => { report = resolve })
  const watchers = new FolderWatchers({ debounceMs: 50, onChange: (changed, scopes) => report([changed, scopes]) })
  t.after(() => watchers.close())
  watchers.sync([folder])
  await fs.writeFile(path.join(folder, "Álbum", "01.mp3"), "audio")
  assert.deepEqual(await reported, [folder, [path.join(folder, "Álbum")]])
})
