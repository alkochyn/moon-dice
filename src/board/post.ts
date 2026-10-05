import { getMiro } from "./sdk"

const escapeHtml = (text: string): string =>
  text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch] as string)

const STICKY_WIDTH = 220
/** Зазор между стикерами в столбике — чтобы они не слипались в один блок. */
const STACK_GAP = 20

/**
 * Цвета стикеров инициативы по кругу: соседи в столбике различаются с первого
 * взгляда. Только светлые — на них тёмный текст Miro читается без усилий.
 */
export const STICKY_PALETTE = [
  "light_yellow",
  "light_green",
  "light_blue",
  "light_pink",
  "orange",
  "cyan",
  "violet",
  "yellow",
  "green",
  "pink",
] as const

export type StickyColor = (typeof STICKY_PALETTE)[number]

export interface Sticker {
  lines: string[]
  color?: StickyColor
  /** Прямоугольный — под одну строку, как у инициативы; квадратный — по умолчанию Miro. */
  shape?: "square" | "rectangle"
}

const toProps = ({ lines, color, shape }: Sticker) => ({
  content: lines.map(escapeHtml).join("<br>"),
  width: STICKY_WIDTH,
  ...(shape ? { shape } : {}),
  ...(color ? { style: { fillColor: color } } : {}),
})

/**
 * Дублирует результат броска на доску — на случай, когда партии удобнее видеть
 * бросок прямо в сцене, а не в панели. Стикеры встают столбиком сверху вниз
 * по центру экрана. Обычный бросок — один стикер, инициатива — по стикеру на
 * участника в порядке ходов, чтобы их можно было двигать и вычёркивать по
 * отдельности.
 */
export const postRollToBoard = async (stickers: Sticker[]): Promise<boolean> => {
  const sdk = getMiro()
  const [first, ...rest] = stickers
  if (!sdk || !first) return false

  try {
    const viewport = await sdk.board.viewport.get()
    const x = viewport.x + viewport.width / 2
    const centerY = viewport.y + viewport.height / 2

    // Высоту стикера Miro выводит сам из ширины, поэтому первый ставим в
    // центр, узнаём его высоту и только тогда поднимаем столбик так, чтобы
    // он целиком оказался посередине экрана.
    const top = await sdk.board.createStickyNote({ ...toProps(first), x, y: centerY })
    if (rest.length === 0) return true

    const step = top.height + STACK_GAP
    top.y = centerY - (rest.length * step) / 2
    await top.sync()

    await Promise.all(
      rest.map((sticker, index) =>
        sdk.board.createStickyNote({ ...toProps(sticker), x, y: top.y + (index + 1) * step }),
      ),
    )
    return true
  } catch {
    return false
  }
}

export const notify = async (text: string): Promise<void> => {
  try {
    await getMiro()?.board.notifications.showInfo(text)
  } catch {
    // Уведомления — необязательная мелочь, молча пропускаем.
  }
}
