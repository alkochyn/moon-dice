import { readFileSync, writeFileSync } from "node:fs"
import { defineConfig, type Plugin } from "vite"
import preact from "@preact/preset-vite"
import { viteSingleFile } from "vite-plugin-singlefile"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }
const buildTime = new Date().toISOString().slice(0, 16).replace("T", " ")
const swVersion = `${pkg.version}-${Date.now().toString(36)}`

/** Подставляет версию в service worker, чтобы новая сборка вытеснила старый кэш. */
const stampServiceWorker = (): Plugin => ({
  name: "stamp-service-worker",
  apply: "build",
  closeBundle() {
    const path = new URL("./dist/sw.js", import.meta.url)
    writeFileSync(path, readFileSync(path, "utf8").replace("__SW_VERSION__", swVersion))
  },
})

// Панель Miro должна грузиться одним запросом и не ходить ни на какие сторонние
// хосты: у части игроков CDN режется провайдером. Поэтому singlefile — весь CSS и
// JS инлайнятся в index.html, а public/ остаётся только под service worker и иконку.
export default defineConfig({
  plugins: [preact(), viteSingleFile({ removeViteModuleLoader: true }), stampServiceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    reportCompressedSize: true,
  },
  server: {
    port: 3000,
    host: true,
  },
})
