import { readKey, subscribeKey, updateKey } from "./storage"
import { newId } from "./log"
import type { Strings } from "../i18n/strings"

const LOCAL_KEY = "dice.presets.v1"
const SHARED_KEY = "presets.shared"
const userKey = (userId: string): string => `presets.user.${userId}`

export interface Preset {
  id: string
  name: string
  formula: string
  color: string
}

export interface PresetBox {
  updatedAt: number
  items: Preset[]
}

export const PRESET_COLORS = ["slate", "red", "amber", "green", "blue", "violet"] as const

/**
 * Стартовый набор для того, кто ещё ничего не сохранял. Названия берутся на
 * языке игрока: пока набор не тронут, он не записан и пересобирается заново,
 * так что после смены языка подписи тоже меняются.
 */
export const defaultPresets = (names: Strings["defaultPresets"]): Preset[] => [
  { id: "default-attack", name: names.attack, formula: "1d20+5", color: "red" },
  { id: "default-damage", name: names.damage, formula: "1d8+3", color: "amber" },
  { id: "default-save", name: names.save, formula: "d20adv", color: "green" },
  { id: "default-stats", name: names.stats, formula: "4d6kh3", color: "blue" },
]

/** Название берётся из метки формулы и может быть пустым — тогда чип покажет
 *  только саму формулу, без дублирования. */
export const makePreset = (name: string, formula: string, color: string = "slate"): Preset => ({
  id: newId(),
  name: name.trim(),
  formula: formula.trim(),
  color,
})

const isPreset = (value: unknown): value is Preset => {
  const preset = value as Preset
  return Boolean(preset) && typeof preset.id === "string" && typeof preset.formula === "string"
}

const sanitize = (items: unknown): Preset[] =>
  Array.isArray(items) ? items.filter(isPreset).map((p) => ({ ...p, color: p.color || "slate" })) : []

/**
 * Переносит бросок в промежуток между другими. index считается по списку
 * без переносимого броска: 0 — в начало, rest.length — в конец. Именно так
 * его видит игрок: взятый чип пропадает из ряда, а линия встаёт между
 * оставшимися. Порядок уезжает в хранилище доски и виден всей партии,
 * поэтому логика вынесена сюда и покрыта тестами.
 */
export const reorderPresets = (items: Preset[], sourceId: string, index: number): Preset[] => {
  const from = items.findIndex((item) => item.id === sourceId)
  if (from === -1) return items

  const rest = items.filter((item) => item.id !== sourceId)
  const to = Math.max(0, Math.min(index, rest.length))
  if (to === from) return items

  return [...rest.slice(0, to), items[from] as Preset, ...rest.slice(to)]
}

export const readLocalPresets = (
  names: Strings["defaultPresets"],
): { items: Preset[]; updatedAt: number; firstRun: boolean } => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return { items: defaultPresets(names), updatedAt: 0, firstRun: true }
    const parsed = JSON.parse(raw) as PresetBox
    return { items: sanitize(parsed.items), updatedAt: parsed.updatedAt ?? 0, firstRun: false }
  } catch {
    return { items: defaultPresets(names), updatedAt: 0, firstRun: true }
  }
}

export const writeLocalPresets = (box: PresetBox): void => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(box))
  } catch {
    // Не смертельно: пресеты останутся в памяти до конца сессии.
  }
}

/**
 * Личные пресеты живут в localStorage (работают и без доски), а копия уезжает
 * в хранилище доски — чтобы не потерять их при смене браузера. При расхождении
 * выигрывает более свежая по updatedAt сторона.
 */
export const syncPersonalPresets = async (userId: string, local: PresetBox): Promise<PresetBox> => {
  const remote = await readKey<PresetBox>(userKey(userId))

  if (remote && typeof remote.updatedAt === "number" && remote.updatedAt > local.updatedAt) {
    const merged = { updatedAt: remote.updatedAt, items: sanitize(remote.items) }
    writeLocalPresets(merged)
    return merged
  }

  if (local.items.length) {
    await updateKey<PresetBox>(userKey(userId), () => local)
  }

  return local
}

export const pushPersonalPresets = async (userId: string, box: PresetBox): Promise<void> => {
  await updateKey<PresetBox>(userKey(userId), () => box)
}

export const readSharedPresets = async (): Promise<Preset[]> => {
  const box = await readKey<PresetBox>(SHARED_KEY)
  return sanitize(box?.items)
}

export const writeSharedPresets = async (items: Preset[]): Promise<void> => {
  await updateKey<PresetBox>(SHARED_KEY, () => ({ updatedAt: Date.now(), items }))
}

export const subscribeSharedPresets = (handler: (items: Preset[]) => void): (() => void) =>
  subscribeKey<PresetBox>(SHARED_KEY, (box) => handler(sanitize(box?.items)))
