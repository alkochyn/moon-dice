/**
 * Мост к Miro Web SDK.
 *
 * Скрипт SDK принципиально не прописан в index.html: у части игроков запрос к
 * внешнему хосту не падает с ошибкой, а молча висит, и блокирующий <script> в
 * <head> превращает панель в белый экран. Поэтому грузим его отсюда, с
 * таймаутом, и при неудаче уходим в локальный режим — кубы должны кидаться
 * всегда, даже без доски.
 */
const SDK_URL = "https://miro.com/app/static/sdk/v2/miro.js"
const LOAD_TIMEOUT_MS = 6_000
/** Если SDK доехал позже таймаута, подхватим его и поднимем режим до «на доске». */
const LATE_POLL_INTERVAL_MS = 2_000
const LATE_POLL_LIMIT_MS = 60_000

export type BoardStatus = "loading" | "connected" | "offline"

export type MiroSdk = typeof miro

export const getMiro = (): MiroSdk | undefined => (globalThis as { miro?: MiroSdk }).miro

export const isInsideMiro = (): boolean => {
  try {
    return globalThis.self !== globalThis.top
  } catch {
    // Кросс-доменный iframe не даёт прочитать top — значит, мы точно вложены.
    return true
  }
}

/** Панель против «тихого» запуска: тот же файл, но открытый через openPanel. */
export const isPanelMode = (): boolean => new URLSearchParams(location.search).has("panel")

let loading: Promise<boolean> | null = null

const injectSdk = (): Promise<boolean> =>
  new Promise((resolve) => {
    const script = document.createElement("script")
    let settled = false

    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok && Boolean(getMiro()))
    }

    script.src = SDK_URL
    script.async = true
    script.addEventListener("load", () => finish(true))
    script.addEventListener("error", () => finish(false))
    document.head.appendChild(script)

    setTimeout(() => finish(false), LOAD_TIMEOUT_MS)
  })

export const ensureSdk = (): Promise<boolean> => {
  if (getMiro()) return Promise.resolve(true)
  if (!isInsideMiro()) return Promise.resolve(false)
  loading ??= injectSdk()

  return loading
}

/** Следит за поздним появлением SDK: вызывает cb(true), если связь всё же поднялась. */
export const watchLateSdk = (cb: (connected: boolean) => void): (() => void) => {
  if (!isInsideMiro()) return () => {}

  const startedAt = Date.now()
  const timer = setInterval(() => {
    if (getMiro()) {
      clearInterval(timer)
      cb(true)
    } else if (Date.now() - startedAt > LATE_POLL_LIMIT_MS) {
      clearInterval(timer)
    }
  }, LATE_POLL_INTERVAL_MS)

  return () => clearInterval(timer)
}

/**
 * «Тихий» экземпляр приложения: висит в фоне и по клику на иконку открывает
 * панель. Сам ничего не рисует.
 */
export const registerIconHandler = async (): Promise<void> => {
  const sdk = getMiro()
  if (!sdk) return

  await sdk.board.ui.on("icon:click", async () => {
    await sdk.board.ui.openPanel({ url: `${location.pathname}?panel=1` })
  })
}

export interface BoardUser {
  id: string
  name: string
}

export const getCurrentUser = async (): Promise<BoardUser | null> => {
  const sdk = getMiro()
  if (!sdk) return null

  try {
    const info = await sdk.board.getUserInfo()
    return { id: info.id, name: info.name || "Игрок" }
  } catch {
    return null
  }
}
