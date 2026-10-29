import { readGlobal, writeGlobal } from "./scope"
import { getMiro, isInsideMiro, isPanelMode } from "./sdk"

/**
 * Статистика использования: сколько досок поставило панель, как часто её
 * открывают и сколько кидают.
 *
 * События уходят в Google Таблицу автора через Apps Script — своего сервера у
 * проекта нет. Адрес приёмника задаётся при сборке (VITE_STATS_URL): без него
 * статистика выключена целиком, и форк не начнёт слать чужие данные автору.
 *
 * Что уходит — только обезличенное: id доски, игрока и команды превращаются в
 * усечённый SHA-256, имён и бросков нет, только их число. Отправка — «выстрелил
 * и забыл» через sendBeacon: на загрузку панели она не влияет, а если хост
 * недоступен, событие просто теряется.
 */
const STATS_URL: string = import.meta.env.VITE_STATS_URL ?? ""
const ENABLED_KEY = "dice.stats.v1"
/**
 * Соль не секрет — код открытый. Она лишь не даёт сверить хэш с хэшем того же
 * id в чужой статистике: id доски Miro случайный, по хэшу его не подобрать.
 */
const SALT = "moon-dice/stats/v1:"
const HASH_LENGTH = 16

export type StatsEvent = "board" | "panel" | "rolls"
export type RollKind = "dice" | "initiative" | "table"

export interface StatsPayload {
  ev: StatsEvent
  board: string
  user: string
  team: string
  version: string
  lang: string
  skin: string
  dice?: number
  initiative?: number
  tables?: number
}

export const statsConfigured = (): boolean => STATS_URL !== ""

/** Отключить можно в настройках игрока; по умолчанию включено. */
export const statsEnabled = (): boolean => statsConfigured() && readGlobal<boolean>(ENABLED_KEY, true)

export const setStatsEnabled = (enabled: boolean): void => writeGlobal(ENABLED_KEY, enabled)

export const hashId = async (raw: string): Promise<string> => {
  if (!raw || !globalThis.crypto?.subtle) return ""

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + raw))
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, HASH_LENGTH)
  } catch {
    return ""
  }
}

/**
 * Команда из id-токена Miro: Web SDK не отдаёт её напрямую, а маркетплейс
 * считает установки именно по организациям. Подпись не проверяем — нам нужен
 * только счётчик, а не доверие.
 */
export const teamFromToken = (token: string): string => {
  const part = token.split(".")[1]
  if (!part) return ""

  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(json) as { team?: unknown }
    return typeof claims.team === "string" || typeof claims.team === "number" ? String(claims.team) : ""
  } catch {
    return ""
  }
}

interface Identity {
  board: string
  user: string
  team: string
}

const readIdentity = async (): Promise<Identity | null> => {
  const sdk = getMiro()
  if (!sdk) return null

  const [board, user, token] = await Promise.all([
    sdk.board.getInfo().then((info) => String(info?.id ?? ""), () => ""),
    sdk.board.getUserInfo().then((info) => String(info?.id ?? ""), () => ""),
    sdk.board.getIdToken().catch(() => ""),
  ])
  // Без доски событие бессмысленно: досок мы и считаем.
  if (!board) return null

  const [boardHash, userHash, teamHash] = await Promise.all([
    hashId(board),
    hashId(user),
    hashId(teamFromToken(token)),
  ])
  return boardHash ? { board: boardHash, user: userHash, team: teamHash } : null
}

const send = (payload: StatsPayload): void => {
  // text/plain — «простой» запрос без preflight: Apps Script на OPTIONS не отвечает.
  const body = JSON.stringify(payload)

  try {
    if (navigator.sendBeacon?.(STATS_URL, new Blob([body], { type: "text/plain" }))) return
  } catch {
    // Падаем на fetch ниже.
  }
  void fetch(STATS_URL, { method: "POST", mode: "no-cors", keepalive: true, body }).catch(() => {
    // Статистика не стоит ни одной ошибки в консоли игрока.
  })
}

interface Context {
  lang: string
  skin: string
}

let identity: Promise<Identity | null> | null = null
let context: Context = { lang: "", skin: "" }
const pending: Record<RollKind, number> = { dice: 0, initiative: 0, table: 0 }

const flushRolls = (): void => {
  const total = pending.dice + pending.initiative + pending.table
  if (total === 0 || !identity) return

  const counts = { dice: pending.dice, initiative: pending.initiative, tables: pending.table }
  pending.dice = pending.initiative = pending.table = 0

  void identity.then((id) => {
    if (id && statsEnabled()) send({ ev: "rolls", ...id, version: __APP_VERSION__, ...context, ...counts })
  })
}

/**
 * Открытие на доске. Фоновый экземпляр приложения поднимается у каждого, кто
 * открыл доску с установленной панелью, — это событие «board»; сама панель по
 * клику на иконку — «panel». Шлём один раз за загрузку страницы.
 */
export const reportOpen = (next: Context): void => {
  context = next
  if (identity || !statsEnabled() || !isInsideMiro()) return

  identity = readIdentity()
  const ev: StatsEvent = isPanelMode() ? "panel" : "board"
  void identity.then((id) => {
    if (id) send({ ev, ...id, version: __APP_VERSION__, ...context })
  })

  // Броски копим и отправляем разом, когда панель уходит с экрана: событие
  // на каждый бросок забило бы таблицу и квоту Apps Script.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushRolls()
  })
  globalThis.addEventListener("pagehide", flushRolls)
}

export const countRoll = (kind: RollKind): void => {
  if (identity) pending[kind] += 1
}
