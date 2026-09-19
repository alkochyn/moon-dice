import { readScoped, writeScoped } from "./scope"
import { readKey, subscribeKey, updateKey } from "./storage"
import { newId } from "./log"

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

export const DEFAULT_PRESETS: Preset[] = [
  { id: "default-attack", name: "Атака", formula: "1d20+5", color: "red" },
  { id: "default-damage", name: "Урон", formula: "1d8+3", color: "amber" },
  { id: "default-save", name: "Спасбросок с преим.", formula: "d20adv", color: "green" },
  { id: "default-stats", name: "Характеристика", formula: "4d6kh3", color: "blue" },
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
 * Переставляет бросок на место другого. Порядок уезжает в хранилище доски и
 * виден всей партии, поэтому логика вынесена сюда и покрыта тестами.
 */
export const reorderPresets = (items: Preset[], sourceId: string, targetId: string): Preset[] => {
  if (sourceId === targetId) return items

  const from = items.findIndex((item) => item.id === sourceId)
  const to = items.findIndex((item) => item.id === targetId)
  if (from === -1 || to === -1) return items

  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as Preset)

  return next
}

/**
 * Личные броски тоже разведены по доскам: один и тот же localStorage обслуживает
 * панель на всех досках сразу, и без пространства набор бросков одной партии
 * подменял набор другой — а потом уезжал в хранилище чужой доски синхронизацией.
 */
export const readLocalPresets = (): { items: Preset[]; updatedAt: number; firstRun: boolean } => {
  const parsed = readScoped<PresetBox | null>(LOCAL_KEY, null)
  if (!parsed) return { items: DEFAULT_PRESETS, updatedAt: 0, firstRun: true }

  return { items: sanitize(parsed.items), updatedAt: parsed.updatedAt ?? 0, firstRun: false }
}

export const writeLocalPresets = (box: PresetBox): void => {
  writeScoped(LOCAL_KEY, box)
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
