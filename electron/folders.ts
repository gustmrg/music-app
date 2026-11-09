import fs from "node:fs"
import path from "node:path"
import { isWithin, outermostFolders } from "./library.ts"

// Watches the folders added to the library and reports which parts of them
// changed. fs.watch is recursive on macOS, Windows, and (since Node.js 20)
// Linux, so one watcher covers each folder. Copying an album produces dozens
// of events, so they are collected per folder and reported after a quiet
// period; the library then compares that part of the folder with the disk.

export type Watcher = { close(): void; on(event: "error", listener: (error: Error) => void): unknown }
export type Watch = (folder: string, listener: (event: string, filename: string | null) => void) => Watcher

export type FolderWatchOptions = {
  // Receives a watched folder and the outermost folders inside it that changed.
  onChange: (folder: string, scopes: string[]) => void
  watch?: Watch
  exists?: (folder: string) => Promise<boolean>
  // Quiet period after the last event before reporting.
  debounceMs?: number
  // Upper bound while events keep arriving, e.g. during a long download.
  maxWaitMs?: number
  // Delay before watching again a folder that disappeared or failed.
  retryMs?: number
}

type Entry = { watcher?: Watcher; scopes: Set<string>; firstEventAt: number; flush?: NodeJS.Timeout; retry?: NodeJS.Timeout }

// persistent: false keeps the watchers from holding the app open on quit.
const defaultWatch: Watch = (folder, listener) => fs.watch(folder, { recursive: true, persistent: false }, (event, filename) => listener(event, filename))
const defaultExists = async (folder: string) => {
  try { return (await fs.promises.stat(folder)).isDirectory() } catch { return false }
}

export class FolderWatchers {
  #entries = new Map<string, Entry>()
  #options: Required<FolderWatchOptions>

  constructor(options: FolderWatchOptions) {
    this.#options = { watch: defaultWatch, exists: defaultExists, debounceMs: 2000, maxWaitMs: 30_000, retryMs: 60_000, ...options }
  }

  get folders(): string[] { return [...this.#entries.keys()] }

  // Starts watching new folders and stops watching the ones no longer listed.
  sync(folders: readonly string[]) {
    for (const [folder, entry] of this.#entries) {
      if (!folders.includes(folder)) { this.#stop(entry); this.#entries.delete(folder) }
    }
    for (const folder of folders) {
      if (this.#entries.has(folder)) continue
      const entry: Entry = { scopes: new Set(), firstEventAt: 0 }
      this.#entries.set(folder, entry)
      this.#start(folder, entry, false)
    }
  }

  close() { this.sync([]) }

  #start(folder: string, entry: Entry, resumed: boolean) {
    try {
      const watcher = this.#options.watch(folder, (_event, filename) => this.#event(folder, entry, filename))
      watcher.on("error", (error) => {
        console.warn(`Stopped watching ${folder}:`, error.message)
        this.#retry(folder, entry)
      })
      entry.watcher = watcher
      // Changes made while the folder was not watched are picked up now.
      if (resumed) this.#queue(folder, entry, folder)
    } catch {
      // The folder is missing (an unmounted disk) or cannot be watched.
      this.#retry(folder, entry)
    }
  }

  #retry(folder: string, entry: Entry) {
    entry.watcher?.close()
    entry.watcher = undefined
    clearTimeout(entry.retry)
    entry.retry = setTimeout(() => {
      entry.retry = undefined
      if (this.#entries.get(folder) === entry) this.#start(folder, entry, true)
    }, this.#options.retryMs)
  }

  #event(folder: string, entry: Entry, filename: string | null) {
    const target = filename ? path.join(folder, filename) : folder
    if (target === folder || !isWithin(folder, target)) {
      // The folder itself changed. When it is gone, its watcher is dead, so
      // it is watched again once the folder returns.
      this.#queue(folder, entry, folder)
      void this.#options.exists(folder).then((exists) => {
        if (!exists && this.#entries.get(folder) === entry && entry.watcher) this.#retry(folder, entry)
      })
      return
    }
    // The parent folder covers both files and folders that were added,
    // removed, or renamed.
    this.#queue(folder, entry, path.dirname(target))
  }

  #queue(folder: string, entry: Entry, scope: string) {
    const now = Date.now()
    if (!entry.flush) entry.firstEventAt = now
    entry.scopes.add(scope)
    clearTimeout(entry.flush)
    const wait = Math.max(0, Math.min(this.#options.debounceMs, entry.firstEventAt + this.#options.maxWaitMs - now))
    entry.flush = setTimeout(() => {
      entry.flush = undefined
      const scopes = outermostFolders([...entry.scopes])
      entry.scopes.clear()
      this.#options.onChange(folder, scopes)
    }, wait)
  }

  #stop(entry: Entry) {
    entry.watcher?.close()
    entry.watcher = undefined
    clearTimeout(entry.flush)
    clearTimeout(entry.retry)
    entry.flush = entry.retry = undefined
    entry.scopes.clear()
  }
}
