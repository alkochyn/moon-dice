import { getMiro, isInsideMiro } from "./sdk"

/**
 * Пространство имён локальной копии.
 *
 * Хранилище самой доски (`board.storage`) разведено по доскам самим Miro, а вот
 * localStorage один на весь домен панели — и панель открывается с одного адреса
 * на каждой доске. Поэтому журнал и сохранённые броски, лежавшие там без
 * префикса, были общими для всех досок, включая доски чужой команды; оттуда же
 * они уезжали в хранилище каждой доски при синхронизации личных бросков.
 *
 * Лечится префиксом: у каждой доски свой набор ключей. Вне Miro доски нет —
 * там одно пространство на всю вкладку.
 */
export const LOCAL_SCOPE = "local"

/** Ключи, которые в прежних версиях лежали общими на все доски. */
const LEGACY_PERSONAL = ["dice.presets.v1", "dice.formulas.v1", "dice.character.v1"]
const LEGACY_LOG = "dice.log.v1"

export const scopedKey = (key: string, scope: string): string => `${key}@${scope}`

/**
 * Что делать со старыми общими ключами при первом запуске с пространствами.
 *
 * Сохранённые броски, историю формул и имя персонажа забирает та доска, которую
 * игрок открыл первой: терять их обидно, а на других досках личные броски всё
 * равно восстановятся из хранилища доски. Журнал на доску не забираем — туда
 * заехали бы чужие броски с другой доски и осели бы в её истории. Вне доски
 * забирать можно: это та же самая история той же вкладки.
 */
export const legacyPlan = (scope: string): { adopt: string[]; drop: string[] } =>
  scope === LOCAL_SCOPE
    ? { adopt: [...LEGACY_PERSONAL, LEGACY_LOG], drop: [] }
    : { adopt: [...LEGACY_PERSONAL], drop: [LEGACY_LOG] }

let scope: string | null = null

export const currentScope = (): string | null => scope

/** Диагностика: в чьём пространстве панель держит локальную копию. */
export const describeScope = (): string => {
  if (!scope) return "не определено — локальная копия выключена"
  return scope === LOCAL_SCOPE ? "вне доски, общее для вкладки" : `доска ${scope}`
}

const adoptLegacy = (target: string): void => {
  const { adopt, drop } = legacyPlan(target)

  try {
    for (const key of adopt) {
      const legacy = localStorage.getItem(key)
      if (legacy === null) continue

      const moved = scopedKey(key, target)
      if (localStorage.getItem(moved) === null) localStorage.setItem(moved, legacy)
      localStorage.removeItem(key)
    }

    for (const key of drop) localStorage.removeItem(key)
  } catch {
    // Хранилище закрыто браузером: переносить нечего и некуда.
  }
}

const readBoardId = async (): Promise<string | null> => {
  const sdk = getMiro()
  if (!sdk) return null

  try {
    const info = await sdk.board.getInfo()
    return info?.id ? String(info.id) : null
  } catch {
    return null
  }
}

/**
 * Поднимает пространство имён; возвращает false, пока доска не назвалась.
 * Пока это не случилось, локальная копия выключена: лучше на секунду показать
 * пустую панель, чем историю соседней доски.
 */
export const resolveScope = async (): Promise<boolean> => {
  if (scope) return true

  const resolved = isInsideMiro() ? await readBoardId() : LOCAL_SCOPE
  if (!resolved) return false

  scope = resolved
  adoptLegacy(resolved)

  return true
}

/** Настройки игрока: одни на все доски, в пространства не делятся. */
export const readGlobal = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export const writeGlobal = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Приватный режим или переполненное хранилище — работаем из памяти.
  }
}

/** Данные доски: читаются и пишутся только в пространстве своей доски. */
export const readScoped = <T>(key: string, fallback: T): T =>
  scope === null ? fallback : readGlobal(scopedKey(key, scope), fallback)

export const writeScoped = (key: string, value: unknown): void => {
  if (scope === null) return
  writeGlobal(scopedKey(key, scope), value)
}
