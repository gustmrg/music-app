/// <reference types="vite/client" />

interface Window {
  // Exposed by electron/preload.ts; absent in the web preview.
  desktop?: import("../shared/ipc").DesktopApi
}
