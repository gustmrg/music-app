# 4. Main process in TypeScript, bundled to CommonJS

- Status: accepted
- Date: 2026-11-02

## Context

The renderer (`src/`) was TypeScript and type-checked in CI, but the Electron main process and preload (`electron/`, about 1,650 lines plus 900 lines of tests) were plain CommonJS (`.cjs`), loaded by Electron as written. No `tsconfig` included them, so the code with the most risk — child processes, the `local-music://` protocol, file paths, and IPC — had no type checking.

The IPC contract was also written three times by hand: the handlers in `main.cjs`, the bridge in `preload.cjs`, and the `window.desktop` type in `src/vite-env.d.ts`. Changing one call's result meant editing several places, and nothing reported a missed one.

Constraints:

- The window uses `sandbox: true`. A sandboxed preload must be a single CommonJS script that requires only `electron`.
- `package.json` has `"type": "module"` for Vite, so a `.js` file is an ES module.
- `music-metadata` and `webtorrent` are ESM-only and are loaded with a dynamic `import()`.
- The change had to be a pure migration, with no behavior change.

## Decision

1. **Sources are TypeScript ES modules** in `electron/*.ts`, with relative imports that include the `.ts` extension and only erasable syntax (`erasableSyntaxOnly`, `verbatimModuleSyntax`). `strict` is on.
2. **esbuild bundles them to CommonJS** (`scripts/build-electron.mjs`): `dist-electron/main.cjs` and `dist-electron/preload.cjs`, with dependencies left external, `import()` kept for the ESM-only packages, and `import.meta.dirname` mapped to `__dirname`. `package.json` points `main` at the bundle, and electron-builder packages `dist-electron/` instead of the sources.
3. **Tests run directly on the sources** with `node --test "electron/*.test.ts"`. Node strips types natively from 22.18, so there is no test build step and test paths stay next to their fixtures.
4. **One IPC contract** in `shared/ipc.ts`. The main process registers handlers through helpers typed by it, the preload builds `window.desktop` from it, and the renderer types `window.desktop` as its `DesktopApi`. Data types shared by both sides live in `shared/types.ts`.
5. `tsconfig.electron.json` joins the `tsc -b` build, so `npm run typecheck` and CI cover the main process. `webtorrent` ships no types; `electron/webtorrent.d.ts` declares the parts the app uses.
6. In development, `build-electron.mjs --watch` rebuilds on change and restarts Electron.

## Consequences

- A handler whose arguments or result differ from what the renderer expects fails the typecheck. Arguments are still validated at runtime, since they come from the renderer.
- Electron no longer runs the sources directly: `npm run build` (or `npm run dev`) must run before starting Electron or packaging.
- Development needs Node.js 22.18 or later for native type stripping. CI pins the Node version bundled with Electron.
- Sources can't use TypeScript features that need code generation (enums, namespaces, parameter properties), because Node only strips types.
- esbuild becomes a direct development dependency. It was already installed through Vite.

## Alternatives considered

- **Type-check the existing `.cjs` with `allowJs`/`checkJs` and JSDoc.** No build change, but JSDoc types are verbose, and the IPC contract would still be duplicated.
- **`tsc` alone, emitting `.cjs` from `.cts` sources.** No bundler, but `.cts` files are CommonJS, so Node could not run the tests from source with ES imports, and typed imports between files would need `import x = require()`, which is not erasable.
- **`tsx` or a test build step.** Works on any Node version, but adds a dependency or an extra compile and moves test output away from the fixtures.
- **ES module main process.** Electron supports it, but the sandboxed preload must stay CommonJS anyway, and one output format for both entries keeps the build simple.
