import { getMiro } from "./sdk"

/** Имя коллекции версионируем: если формат записей поменяется, старое не поедет. */
export const COLLECTION = "dice.v1"

const RETRIES = 3

/**
 * Хранилище доски через нестрогий интерфейс: типы SDK требуют Json-совместимых
 * дженериков, а нам удобнее работать своими структурами и валидировать их на чтении.
 */
interface RawCollection {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  onValue(key: string, handler: (value: unknown) => void): Promise<void>
  offValue(key: string, handler: (value: unknown) => void): Promise<void>
}

const getCollection = (): RawCollection | undefined =>
  getMiro()?.board.storage.collection(COLLECTION) as RawCollection | undefined

export const readKey = async <T>(key: string): Promise<T | undefined> => {
  const collection = getCollection()
  if (!collection) return undefined

  try {
    return (await collection.get(key)) as T | undefined
  } catch {
    return undefined
  }
}

export const writeKey = async <T>(key: string, value: T): Promise<boolean> => {
  const collection = getCollection()
  if (!collection) return false

  try {
    await collection.set(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * Read-modify-write с повторами: два игрока могут кинуть кубы одновременно,
 * и тогда последний set затрёт чужую запись. Перечитываем и пробуем снова —
 * записи в журнале различаются по id, дубли схлопываются на чтении.
 */
export const updateKey = async <T>(key: string, mutate: (current: T | undefined) => T): Promise<T | null> => {
  const collection = getCollection()
  if (!collection) return null

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const current = (await collection.get(key)) as T | undefined
      const next = mutate(current)
      await collection.set(key, next)
      return next
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1) + Math.random() * 80))
    }
  }

  return null
}

/**
 * Диагностика: отвечает ли хранилище доски прямо сейчас. В отличие от readKey
 * не глотает ошибку, а возвращает её текст — именно он и нужен, когда у игрока
 * «ничего не работает», а почему — неизвестно.
 */
export const probeBoardStorage = async (): Promise<string> => {
  const collection = getCollection()
  if (!collection) return "недоступно: нет SDK"

  try {
    await collection.get("__probe")
    return "доступно"
  } catch (error) {
    return `ошибка: ${(error as Error).name} ${(error as Error).message}`
  }
}

export const subscribeKey = <T>(key: string, handler: (value: T | undefined) => void): (() => void) => {
  const collection = getCollection()
  if (!collection) return () => {}

  const wrapped = (value: unknown): void => handler(value as T | undefined)
  void collection.onValue(key, wrapped)

  return () => {
    void collection.offValue(key, wrapped)
  }
}
