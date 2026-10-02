import { getMiro } from "./sdk"
import { readKey, writeKey } from "./storage"

/**
 * Карточка игрока на доске: то, что нужно другим, чтобы действовать за него.
 * Пока это только формула инициативы — мастер кидает её за всех одной кнопкой,
 * — плюс имя и внешность, чтобы строка в журнале была узнаваемой.
 *
 * У каждого игрока свой ключ, и пишет в него только он сам: гонок записи
 * здесь не бывает в принципе.
 */
export interface PlayerProfile {
  updatedAt: number
  name: string
  icon: string
  color: string
  initiative: string
}

const profileKey = (userId: string): string => `player.${userId}`

const isProfile = (value: unknown): value is PlayerProfile => {
  const profile = value as PlayerProfile
  return Boolean(profile) && typeof profile.name === "string" && typeof profile.initiative === "string"
}

export const publishProfile = (userId: string, profile: PlayerProfile): Promise<boolean> =>
  writeKey(profileKey(userId), profile)

export const readProfile = async (userId: string): Promise<PlayerProfile | undefined> => {
  const stored = await readKey<unknown>(profileKey(userId))
  return isProfile(stored) ? stored : undefined
}

export interface OnlineUser {
  id: string
  name: string
}

/** Кто сейчас на доске. null — SDK не ответил: отличаем от «никого нет». */
export const readOnlineUsers = async (): Promise<OnlineUser[] | null> => {
  const sdk = getMiro()
  if (!sdk) return null

  try {
    return (await sdk.board.getOnlineUsers()).map((user) => ({ id: user.id, name: user.name ?? "" }))
  } catch {
    return null
  }
}
