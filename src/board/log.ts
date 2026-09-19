import { readScoped, writeScoped } from "./scope"
import { readKey, subscribeKey, updateKey } from "./storage"

export const LOG_KEY = "log"
export const MAX_ENTRIES = 200
const LOCAL_KEY = "dice.log.v1"

export interface RollEntry {
  id: string
  ts: number
  userId: string
  userName: string
  /** Иконка и цвет игрока едут вместе с броском: у остальных доступа к его
   *  настройкам нет, а значок в журнале должен быть тот же самый. */
  icon?: string
  color?: string
  expression: string
  label?: string
  results: Array<{ total: number; detail: string }>
}

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Свежие сверху, дубли по id схлопываются, длина ограничена. */
export const mergeEntries = (...lists: RollEntry[][]): RollEntry[] => {
  const byId = new Map<string, RollEntry>()

  for (const list of lists) {
    for (const entry of list) {
      if (entry && typeof entry.id === "string") byId.set(entry.id, entry)
    }
  }

  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES)
}

/**
 * Сведение журнала для подписки и опроса. Если ничего нового не приехало,
 * возвращает прежний массив — иначе опрос раз в несколько секунд гонял бы
 * перерисовку панели вхолостую.
 */
export const nextEntries = (prev: RollEntry[], incoming: RollEntry[]): RollEntry[] => {
  const merged = mergeEntries(prev, incoming)
  const same = merged.length === prev.length && merged.every((entry, index) => entry.id === prev[index]?.id)

  return same ? prev : merged
}

/**
 * Копия журнала своей доски. Ключ разведён по доскам: без этого история одной
 * партии всплывала на всех остальных досках, где открыта панель.
 */
export const readLocalLog = (): RollEntry[] => {
  const parsed = readScoped<unknown>(LOCAL_KEY, [])
  return Array.isArray(parsed) ? (parsed as RollEntry[]) : []
}

export const writeLocalLog = (entries: RollEntry[]): void => {
  writeScoped(LOCAL_KEY, entries.slice(0, MAX_ENTRIES))
}

export const readBoardLog = async (): Promise<RollEntry[]> => {
  const stored = await readKey<RollEntry[]>(LOG_KEY)
  return Array.isArray(stored) ? stored : []
}

/** Диагностика: что реально лежит в журнале доски прямо сейчас. */
export const describeBoardLog = async (): Promise<string> => {
  const stored = await readKey<RollEntry[]>(LOG_KEY)
  if (!Array.isArray(stored)) return "пуст или недоступен"

  const last = stored[stored.length - 1]
  const when = last ? new Date(last.ts).toLocaleTimeString("ru-RU") : "—"

  return `${stored.length} записей, последняя от «${last?.userName ?? "?"}» в ${when}`
}

export const publishEntry = async (entry: RollEntry): Promise<boolean> => {
  const next = await updateKey<RollEntry[]>(LOG_KEY, (current) =>
    mergeEntries(Array.isArray(current) ? current : [], [entry]),
  )

  return next !== null
}

/**
 * Сколько раз подписка принесла чужое изменение. Первый вызов не считаем —
 * это начальное значение, которое Miro отдаёт сразу при подписке.
 * Нужно, чтобы отличать «живые обновления работают» от «журнал приезжает
 * только опросом».
 */
let liveUpdates = 0

export const countLiveUpdates = (): number => liveUpdates

export const subscribeBoardLog = (
  handler: (entries: RollEntry[]) => void,
  onError?: (message: string) => void,
): (() => void) => {
  let initial = true

  return subscribeKey<RollEntry[]>(
    LOG_KEY,
    (value) => {
      if (initial) initial = false
      else liveUpdates++
      handler(Array.isArray(value) ? value : [])
    },
    onError,
  )
}
