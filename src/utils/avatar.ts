/**
 * Аватарки рисуем сами: Miro Web SDK картинок не отдаёт (getUserInfo — это id,
 * имя и почта, getOnlineUsers — id и имя), а тянуть их из REST значило бы
 * зашить токен в статическую страницу. Инициалы плюс цвет из id: ни одного
 * запроса наружу, работает офлайн и для записей игроков, которые давно ушли.
 */
const hash = (value: string): number => {
  let result = 0
  for (let i = 0; i < value.length; i++) {
    result = (result * 31 + value.charCodeAt(i)) | 0
  }

  return Math.abs(result)
}

/** Одна-две буквы: «Alex Kochyn» → «AK», «Юнис» → «Ю». */
export const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return "?"

  const letters = words.slice(0, 2).map((word) => [...word][0] ?? "")

  return letters.join("").toUpperCase()
}

/**
 * Цвет привязан к id, а не к имени: игрок остаётся того же цвета, даже если
 * переименуется, и двое тёзок в партии различимы.
 */
export const avatarColor = (seed: string): string => `hsl(${hash(seed) % 360} 52% 42%)`
