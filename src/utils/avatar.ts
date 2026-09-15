import { ICON_IDS } from "../data/icons"

/**
 * Внешность игрока в журнале: иконка и цвет кружка.
 *
 * Пока игрок ничего не выбрал, и то и другое выводится из его id — так у
 * каждого сразу свой узнаваемый значок, одинаковый у всех, кто смотрит журнал,
 * и не зависящий от того, сохранилось ли что-нибудь в браузере.
 */
const hash = (value: string): number => {
  let result = 0
  for (let i = 0; i < value.length; i++) {
    result = (result * 31 + value.charCodeAt(i)) | 0
  }

  return Math.abs(result)
}

export const AVATAR_COLORS = [
  "#d7373f",
  "#e2620f",
  "#b45309",
  "#1f9d55",
  "#0f766e",
  "#2563eb",
  "#4338ca",
  "#7c3aed",
  "#be185d",
  "#9f1239",
  "#475569",
  "#1f2937",
] as const

export const defaultIconId = (seed: string): string => ICON_IDS[hash(seed) % ICON_IDS.length] as string

export const defaultColor = (seed: string): string =>
  AVATAR_COLORS[hash(`${seed}·цвет`) % AVATAR_COLORS.length] as string

/** Запасной вариант, если иконка не нашлась: одна-две буквы имени. */
export const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return "?"

  const letters = words.slice(0, 2).map((word) => [...word][0] ?? "")

  return letters.join("").toUpperCase()
}

export const randomIconId = (): string => ICON_IDS[Math.floor(Math.random() * ICON_IDS.length)] as string

export const randomColor = (): string => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] as string
