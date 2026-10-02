/**
 * Облик панели — настройка игрока, как язык: у каждого в партии свой, на
 * общий журнал не влияет. Обычный остаётся по умолчанию.
 */
export type Skin = "classic" | "terminal"

export const SKINS: Skin[] = ["classic", "terminal"]

export const DEFAULT_SKIN: Skin = "classic"

export const isSkin = (value: unknown): value is Skin => value === "classic" || value === "terminal"
