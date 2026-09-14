import { render } from "preact"

import { App } from "./app"
import { ensureSdk, isPanelMode, registerIconHandler } from "./board/sdk"

const root = document.getElementById("app")
if (root) render(<App />, root)

// Фоновый экземпляр приложения вешает обработчик на иконку в тулбаре;
// панель открывается тем же файлом с ?panel=1.
void ensureSdk().then(async (connected) => {
  if (connected && !isPanelMode()) await registerIconHandler()
})

// Офлайн-кэш: после первой удачной загрузки панель поднимается,
// даже если хостинг недоступен.
const secureContext = location.protocol === "https:" || location.hostname === "localhost"

if ("serviceWorker" in navigator && secureContext) {
  globalThis.addEventListener("load", () => {
    // Путь относительный: зеркало может лежать в подкаталоге (GitHub Pages).
    void navigator.serviceWorker.register("./sw.js").catch(() => {
      // Без service worker панель просто теряет офлайн-режим.
    })
  })
}
