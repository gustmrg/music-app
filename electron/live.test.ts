import { test } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import type { ChildProcess } from "node:child_process"
import { LiveStreams, ffmpegArgs, ffmpegAvailable, FFMPEG_MISSING } from "./live.ts"
import type { LiveSource, Spawn } from "./live.ts"

// A stand-in for an ffmpeg process: tests write to stdout and end it.
class FakeProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  args: string[]
  constructor(args: string[]) {
    super()
    this.args = args
  }
  kill(signal: NodeJS.Signals = "SIGTERM") {
    if (this.exitCode !== null || this.signalCode !== null) return true
    this.signalCode = signal
    setImmediate(() => this.emit("close", null, signal))
    return true
  }
  exit(code: number) {
    this.exitCode = code
    this.stdout.end()
    setImmediate(() => this.emit("close", code, null))
  }
}

function fakeSpawn() {
  const processes: FakeProcess[] = []
  const waiters: ((process: FakeProcess) => void)[] = []
  const spawn: Spawn = (_command, args) => {
    const process = new FakeProcess(args)
    processes.push(process)
    waiters.shift()?.(process)
    return process as unknown as ChildProcess
  }
  const next = () => new Promise<FakeProcess>((resolve) => waiters.push(resolve))
  return { spawn, processes, next }
}

const options = { retryDelayMs: 1, maxAttempts: 2, firstByteTimeoutMs: 2000 }
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
const decoder = new TextDecoder()

function sourceOf(...answers: { url: string; isLive: boolean }[]) {
  const calls: boolean[] = []
  const source: LiveSource = async (fresh) => {
    calls.push(fresh)
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]
    if (!answer) throw new Error("yt-dlp failed")
    return answer
  }
  return { source, calls }
}

test("builds ffmpeg arguments that remux the audio without re-encoding", () => {
  const args = ffmpegArgs("https://manifest.example/index.m3u8")
  assert.deepEqual(args.slice(args.indexOf("-i"), args.indexOf("-i") + 2), ["-i", "https://manifest.example/index.m3u8"])
  assert.deepEqual(args.slice(-6), ["-vn", "-c:a", "copy", "-f", "adts", "pipe:1"])
  for (const flag of ["-reconnect", "-reconnect_streamed", "-reconnect_delay_max", "-nostdin"]) assert.ok(args.includes(flag), flag)
  assert.ok(!args.includes("-y"))
})

test("streams ffmpeg output as unsized AAC", async () => {
  const { spawn, next } = fakeSpawn()
  const lives = new LiveStreams({ spawn, ...options })
  const { source } = sourceOf({ url: "https://m/1.m3u8", isLive: true })
  const opened = lives.open(source)
  const ffmpeg = await next()
  assert.equal(ffmpeg.args[ffmpeg.args.indexOf("-i") + 1], "https://m/1.m3u8")
  ffmpeg.stdout.write("frame-1")
  const response = await opened
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "audio/aac")
  assert.equal(response.headers.get("content-length"), null)
  assert.equal(response.headers.get("accept-ranges"), null)
  const reader = response.body!.getReader()
  assert.equal(decoder.decode((await reader.read()).value), "frame-1")
  await reader.cancel()
  await tick()
  assert.equal(ffmpeg.signalCode, "SIGKILL")
  assert.equal(lives.active, false)
})

test("restarts ffmpeg with a fresh manifest when it stops, in the same response", async () => {
  const { spawn, next } = fakeSpawn()
  const lives = new LiveStreams({ spawn, ...options })
  const { source, calls } = sourceOf({ url: "https://m/old.m3u8", isLive: true }, { url: "https://m/new.m3u8", isLive: true })
  const opened = lives.open(source)
  const first = await next()
  first.stdout.write("a")
  const reader = (await opened).body!.getReader()
  assert.equal(decoder.decode((await reader.read()).value), "a")
  const second = next()
  first.exit(1)
  const restarted = await second
  assert.equal(restarted.args[restarted.args.indexOf("-i") + 1], "https://m/new.m3u8")
  restarted.stdout.write("b")
  assert.equal(decoder.decode((await reader.read()).value), "b")
  assert.deepEqual(calls, [false, true])
  await reader.cancel()
})

test("ends the stream when the broadcast is no longer live", async () => {
  const { spawn, next } = fakeSpawn()
  const lives = new LiveStreams({ spawn, ...options })
  const { source } = sourceOf({ url: "https://m/1.m3u8", isLive: true }, { url: "https://v/recording", isLive: false })
  const opened = lives.open(source)
  const ffmpeg = await next()
  ffmpeg.stdout.write("last")
  const reader = (await opened).body!.getReader()
  await reader.read()
  ffmpeg.exit(0)
  assert.equal((await reader.read()).done, true)
})

test("gives up after repeated failures and reports them before any audio", async () => {
  const { spawn, processes } = fakeSpawn()
  const lives = new LiveStreams({ spawn, ...options })
  const { source } = sourceOf({ url: "https://m/1.m3u8", isLive: true })
  const opened = lives.open(source)
  // Every run dies without output: 1 try + 2 retries, then a 502.
  for (let run = 0; run < 3; run++) {
    while (processes.length <= run) await tick()
    processes[run]!.exit(1)
  }
  const response = await opened
  assert.equal(response.status, 502)
  assert.equal(processes.length, 3)
})

test("answers 409 for a video that is not live and 502 when yt-dlp fails", async () => {
  const { spawn, processes } = fakeSpawn()
  const lives = new LiveStreams({ spawn, ...options })
  assert.equal((await lives.open(sourceOf({ url: "https://v/x", isLive: false }).source)).status, 409)
  assert.equal((await lives.open(sourceOf().source)).status, 502)
  assert.equal(processes.length, 0)
})

test("reports a missing ffmpeg with a clear message", async () => {
  const missing: Spawn = () => {
    const process = new FakeProcess([])
    setImmediate(() => {
      process.emit("error", Object.assign(new Error("spawn ffmpeg ENOENT"), { code: "ENOENT" }))
      process.emit("close", -2, null)
    })
    return process as unknown as ChildProcess
  }
  const lives = new LiveStreams({ spawn: missing, ...options })
  const response = await lives.open(sourceOf({ url: "https://m/1.m3u8", isLive: true }).source)
  assert.equal(response.status, 503)
  assert.equal(await response.text(), FFMPEG_MISSING)
  assert.equal(await ffmpegAvailable(missing), false)
})

test("keeps a single ffmpeg: a new live or stopAll closes the previous one", async () => {
  const { spawn, next } = fakeSpawn()
  const lives = new LiveStreams({ spawn, ...options })
  const live = { url: "https://m/1.m3u8", isLive: true }
  const firstOpen = lives.open(sourceOf(live).source)
  const first = await next()
  first.stdout.write("1")
  await firstOpen
  const secondOpen = lives.open(sourceOf(live).source)
  const second = await next()
  assert.equal(first.signalCode, "SIGKILL")
  second.stdout.write("2")
  await secondOpen
  lives.stopAll()
  await tick()
  assert.equal(second.signalCode, "SIGKILL")
  assert.equal(lives.active, false)
})

test("an aborted request stops its ffmpeg", async () => {
  const { spawn, next } = fakeSpawn()
  const lives = new LiveStreams({ spawn, ...options })
  const controller = new AbortController()
  const opened = lives.open(sourceOf({ url: "https://m/1.m3u8", isLive: true }).source, controller.signal)
  const ffmpeg = await next()
  ffmpeg.stdout.write("x")
  await opened
  controller.abort()
  await tick()
  assert.equal(ffmpeg.signalCode, "SIGKILL")
})

test("ffmpegAvailable answers for the real binary whether or not it is installed", async () => {
  assert.equal(typeof await ffmpegAvailable(), "boolean")
})
