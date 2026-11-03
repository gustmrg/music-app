import { spawn as spawnProcess } from "node:child_process"
import type { ChildProcess } from "node:child_process"

// YouTube lives resolve to HLS manifests, which <audio> cannot play. Each
// live is served at local-music://live/<id> as raw AAC remuxed by ffmpeg
// (no re-encoding), so the player keeps using a plain <audio> element.
// See docs/adr/0003-youtube-lives-via-ffmpeg.md.

// What a live route needs from the YouTube resolver: the current manifest,
// and whether the video is still on air. `fresh` skips any cached URL.
export type LiveSource = (fresh: boolean) => Promise<{ url: string; isLive: boolean }>
export type Spawn = (command: string, args: string[]) => ChildProcess

export type LiveOptions = {
  spawn?: Spawn
  ffmpeg?: string
  // Consecutive ffmpeg runs that may fail before the stream gives up.
  maxAttempts?: number
  retryDelayMs?: number
  firstByteTimeoutMs?: number
}

export const FFMPEG_MISSING = "Instale o ffmpeg para tocar transmissões ao vivo do YouTube (por exemplo, sudo apt install ffmpeg ou brew install ffmpeg) e tente de novo."

// -reconnect* rides out short network drops inside ffmpeg itself; longer
// ones end the process and LiveStreams re-resolves the manifest.
export function ffmpegArgs(manifest: string): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_on_network_error", "1", "-reconnect_delay_max", "5",
    "-i", manifest,
    "-vn", "-c:a", "copy", "-f", "adts", "pipe:1",
  ]
}

const defaultSpawn: Spawn = (command, args) => spawnProcess(command, args, { stdio: ["ignore", "pipe", "pipe"] })

// Resolves whether ffmpeg can be started at all, so callers can explain a
// missing install before the player even asks for audio.
export function ffmpegAvailable(spawn: Spawn = defaultSpawn, ffmpeg = "ffmpeg"): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try { child = spawn(ffmpeg, ["-hide_banner", "-version"]) } catch { resolve(false); return }
    child.stdout?.resume()
    child.stderr?.resume()
    child.once("error", () => resolve(false))
    child.once("close", (code) => resolve(code === 0))
  })
}

class LiveError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code === "ENOENT"

// One live stream: successive ffmpeg runs feeding a single response body.
// ADTS is a sequence of self-contained frames, so restarting ffmpeg with a
// fresh manifest continues the same audio stream without a new request.
class LiveSession {
  closed = false
  private child: ChildProcess | null = null
  private controller!: ReadableStreamDefaultController<Uint8Array>
  private failures = 0
  private delivered = false
  private settleFirst!: (error?: LiveError) => void
  readonly firstBytes: Promise<void>
  readonly body: ReadableStream<Uint8Array>
  private readonly source: LiveSource
  private readonly options: Required<LiveOptions>

  constructor(source: LiveSource, options: Required<LiveOptions>) {
    this.source = source
    this.options = options
    this.firstBytes = new Promise<void>((resolve, reject) => {
      this.settleFirst = (error) => error ? reject(error) : resolve()
    })
    // Rejections before the first byte are reported through firstBytes.
    this.firstBytes.catch(() => {})
    this.body = new ReadableStream<Uint8Array>({
      start: (controller) => { this.controller = controller },
      pull: () => { this.child?.stdout?.resume() },
      cancel: () => { this.close() },
    }, new ByteLengthQueuingStrategy({ highWaterMark: 256 * 1024 }))
  }

  async run(fresh: boolean): Promise<void> {
    if (this.closed) return
    let resolved: { url: string; isLive: boolean }
    try { resolved = await this.source(fresh) } catch (error) {
      return this.retry(new LiveError(error instanceof Error ? error.message : "Não foi possível obter a transmissão.", 502))
    }
    if (this.closed) return
    // The broadcast ended: finish the response like any file that ends.
    if (!resolved.isLive) return this.end(new LiveError("Esta transmissão não está ao vivo agora.", 409))
    let child: ChildProcess
    try { child = this.options.spawn(this.options.ffmpeg, ffmpegArgs(resolved.url)) } catch (error) {
      return this.fail(isMissing(error) ? new LiveError(FFMPEG_MISSING, 503) : new LiveError("Não foi possível iniciar o ffmpeg.", 500))
    }
    this.child = child
    let output = false
    let stderr = ""
    child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000) })
    child.stdout?.on("data", (chunk: Buffer) => {
      if (this.closed) return
      if (!output) { output = true; this.failures = 0 }
      if (!this.delivered) { this.delivered = true; this.settleFirst() }
      this.controller.enqueue(new Uint8Array(chunk))
      // Backpressure: wait for the player to read before taking more.
      if ((this.controller.desiredSize ?? 1) <= 0) child.stdout?.pause()
    })
    child.once("error", (error) => {
      if (this.child === child) this.child = null
      if (isMissing(error)) this.fail(new LiveError(FFMPEG_MISSING, 503))
    })
    child.once("close", (code) => {
      if (this.child === child) this.child = null
      if (this.closed) return
      if (stderr.trim()) console.error(`ffmpeg exited with code ${code}:`, stderr.trim().split("\n").slice(-3).join(" | "))
      // Manifests expire and networks drop: re-resolve and continue.
      void this.retry(new LiveError("A transmissão foi interrompida e não pôde ser retomada.", 502))
    })
  }

  private async retry(error: LiveError): Promise<void> {
    if (this.closed) return
    this.failures++
    if (this.failures > this.options.maxAttempts) return this.fail(error)
    await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs * this.failures))
    return this.run(true)
  }

  // Ends the body normally once audio was sent; before that, the request
  // itself fails with the given status.
  private end(error: LiveError) {
    if (!this.delivered) return this.fail(error)
    this.closeWith(() => this.controller.close())
  }

  private fail(error: LiveError) {
    this.settleFirst(error)
    this.closeWith(() => this.controller.error(error))
  }

  private closeWith(finish: () => void) {
    if (this.closed) return
    this.closed = true
    this.stop()
    try { finish() } catch { /* the reader already went away */ }
  }

  close() {
    if (this.closed) return
    this.settleFirst(new LiveError("A transmissão foi encerrada.", 499))
    this.closeWith(() => this.controller.close())
  }

  private stop() {
    const child = this.child
    this.child = null
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    // ffmpeg only writes to a pipe nobody reads anymore, so there is nothing
    // to finish gracefully. SIGTERM can take seconds, long enough to outlive
    // the app when it quits; SIGKILL cannot leave a process behind.
    child.kill("SIGKILL")
  }
}

// Serves lives one at a time: opening a stream closes the previous one, so
// switching tracks or pausing (which drops the request) never leaves an
// ffmpeg process behind.
export class LiveStreams {
  private current: LiveSession | null = null
  private readonly options: Required<LiveOptions>

  constructor(options: LiveOptions = {}) {
    this.options = {
      spawn: options.spawn ?? defaultSpawn,
      ffmpeg: options.ffmpeg ?? "ffmpeg",
      maxAttempts: options.maxAttempts ?? 3,
      retryDelayMs: options.retryDelayMs ?? 1000,
      firstByteTimeoutMs: options.firstByteTimeoutMs ?? 45_000,
    }
  }

  get active(): boolean { return this.current !== null && !this.current.closed }

  async open(source: LiveSource, signal?: AbortSignal): Promise<Response> {
    this.current?.close()
    const session = new LiveSession(source, this.options)
    this.current = session
    signal?.addEventListener("abort", () => session.close(), { once: true })
    void session.run(false)
    const timeout = setTimeout(() => session.close(), this.options.firstByteTimeoutMs)
    try {
      await session.firstBytes
    } catch (error) {
      const status = error instanceof LiveError ? (error.status === 499 && !signal?.aborted ? 504 : error.status) : 500
      return new Response(error instanceof Error ? error.message : null, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    } finally {
      clearTimeout(timeout)
    }
    // No Content-Length and no ranges: a live has no size and cannot seek.
    return new Response(session.body, { status: 200, headers: { "Content-Type": "audio/aac", "Cache-Control": "no-store" } })
  }

  stopAll() {
    this.current?.close()
    this.current = null
  }
}
