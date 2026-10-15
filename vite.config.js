import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { visualizer } from "rollup-plugin-visualizer"

// Splits the big libraries into their own files, so they cache across deploys and the lazy ones
// stay lazy.
//
// IMPORTANT: Firebase is deliberately NOT one chunk. Auth is imported statically, but Firestore and
// App Check are loaded on demand (see src/lib/firebase.js and src/lib/history.js). If they shared a
// chunk with Auth, the entry bundle would import that chunk up front and the lazy loading would be
// lost. So:
//   firebase-core       @firebase/app, util, component, logger: what every Firebase piece needs
//   firebase-auth       sign-in: loaded with the app
//   firebase-firestore  history and saving: loaded on first use
//   firebase-app-check  loaded after first paint
// Everything else (jspdf, ...) keeps Vite's default splitting.
function manualChunks(id) {
  const path = id.replace(/\\/g, "/")
  if (!path.includes("/node_modules/")) return undefined

  // Order matters: the specific Firebase pieces are matched before the shared core.
  if (
    path.includes("/node_modules/@firebase/firestore/") ||
    path.includes("/node_modules/firebase/firestore/") ||
    path.includes("/node_modules/@firebase/webchannel-wrapper/")
  ) {
    return "firebase-firestore"
  }
  if (path.includes("/node_modules/@firebase/app-check/") || path.includes("/node_modules/firebase/app-check/")) {
    return "firebase-app-check"
  }
  if (path.includes("/node_modules/@firebase/auth/") || path.includes("/node_modules/firebase/auth/")) {
    return "firebase-auth"
  }
  if (
    path.includes("/node_modules/@firebase/app/") ||
    path.includes("/node_modules/@firebase/util/") ||
    path.includes("/node_modules/@firebase/component/") ||
    path.includes("/node_modules/@firebase/logger/") ||
    path.includes("/node_modules/firebase/app/")
  ) {
    return "firebase-core"
  }

  if (
    path.includes("/node_modules/react/") ||
    path.includes("/node_modules/react-dom/") ||
    path.includes("/node_modules/scheduler/")
  ) {
    return "vendor-react"
  }

  return undefined
}

// `npm run analyze` builds in "analyze" mode and writes stats.html (a treemap with gzip and brotli
// sizes) next to the project. Using a mode instead of an environment variable keeps it working on
// Windows, macOS and Linux without extra tools. A normal `npm run build` writes no report.
export default defineConfig(({ mode }) => {
  const analyze = mode === "analyze"

  return {
    plugins: [
      react(),
      analyze &&
        visualizer({
          filename: "stats.html",
          template: "treemap",
          gzipSize: true,
          brotliSize: true,
          open: true,
        }),
    ].filter(Boolean),

    build: {
      rollupOptions: {
        output: { manualChunks },
      },
    },
  }
})