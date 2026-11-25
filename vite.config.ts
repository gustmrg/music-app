import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Keep the production CSP strict ("connect-src 'self'") and allow Vite's HMR
// WebSocket only while running the dev server.
function devHmrCsp(): Plugin {
  return {
    name: "dev-hmr-csp",
    transformIndexHtml(html, ctx) {
      if (!ctx.server) return html
      return html.replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173")
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devHmrCsp()],
  base: "./",
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
})
