import { readKey, subscribeKey, updateKey } from "./storage"

export const LOG_KEY = "log"
export const MAX_ENTRIES = 200
const LOCAL_KEY = "dice.log.v1"

export interface RollEntry {
  id: string
  ts: number
  userId: string
  userName: string
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

export const readLocalLog = (): RollEntry[] => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as RollEntry[]) : []
  } catch {
    return []
  }
}

export const writeLocalLog = (entries: RollEntry[]): void => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // Приватный режим или переполненное хранилище — журнал в памяти всё равно жив.
  }
}

export const readBoardLog = async (): Promise<RollEntry[]> => {
  const stored = await readKey<RollEntry[]>(LOG_KEY)
  return Array.isArray(stored) ? stored : []
}

export const publishEntry = async (entry: RollEntry): Promise<boolean> => {
  const next = await updateKey<RollEntry[]>(LOG_KEY, (current) =>
    mergeEntries(Array.isArray(current) ? current : [], [entry]),
  )

  return next !== null
}

export const clearBoardLog = async (): Promise<void> => {
  await updateKey<RollEntry[]>(LOG_KEY, () => [])
}

export const subscribeBoardLog = (handler: (entries: RollEntry[]) => void): (() => void) =>
  subscribeKey<RollEntry[]>(LOG_KEY, (value) => handler(Array.isArray(value) ? value : []))
