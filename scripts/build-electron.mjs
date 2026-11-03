// Bundles the Electron main process and preload from electron/*.ts into
// dist-electron/*.cjs. Both stay CommonJS: Electron loads main.cjs directly,
// and sandboxed preloads cannot be ES modules.
//
//   node scripts/build-electron.mjs            build once
//   node scripts/build-electron.mjs --watch    rebuild on change and (re)start
//                                              Electron against the Vite server
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { context, build } from "esbuild"

const root = path.resolve(import.meta.dirname, "..")
const watch = process.argv.includes("--watch")

const options = {
  absWorkingDir: root,
  entryPoints: { main: "electron/main.ts", preload: "electron/preload.ts" },
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  // Dependencies load from node_modules at runtime; music-metadata and
  // webtorrent are ESM-only and keep their dynamic import().
  packages: "external",
  external: ["electron"],
  // Sources are ES modules (so Node can run the tests directly); in the
  // CommonJS bundle the module's directory is __dirname.
  define: { "import.meta.dirname": "__dirname" },
  sourcemap: "linked",
  logLevel: "warning",
}

if (!watch) {
  await build(options)
} else {
  const electron = createRequire(import.meta.url)("electron")
  let child = null
  const restart = () => {
    if (child) {
      child.removeAllListeners("exit")
      child.kill()
    }
    child = spawn(electron, ["."], { cwd: root, stdio: "inherit" })
    // Closing the window ends the dev session, like `electron .` did.
    child.on("exit", (code) => process.exit(code ?? 0))
  }
  const ctx = await context({
    ...options,
    plugins: [{
      name: "restart-electron",
      setup(builder) {
        builder.onEnd((result) => {
          if (result.errors.length) return
          restart()
        })
      },
    }],
  })
  await ctx.watch()
  const stop = () => { child?.kill(); void ctx.dispose().then(() => process.exit(0)) }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
}
