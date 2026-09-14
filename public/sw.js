/**
 * Офлайн-кэш панели.
 *
 * Смысл ровно один: если хостинг недоступен (упал, заблокирован, режется
 * провайдером), панель всё равно обязана открыться. Вся панель — это один
 * index.html, поэтому кэшируем его и отдаём на любой navigation-запрос,
 * включая `/?panel=1`.
 */
const VERSION = "__SW_VERSION__"
const CACHE = `dice-${VERSION}`
const SHELL = "./index.html"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(SHELL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event

  if (request.method !== "GET") return

  // Панель: сначала сеть (чтобы прилетала свежая версия), при любой заминке — кэш.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(SHELL, copy))
          return response
        })
        .catch(() => caches.match(SHELL).then((cached) => cached || Response.error())),
    )
    return
  }

  // Всё остальное со своего origin: кэш, иначе сеть.
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
  }
})
