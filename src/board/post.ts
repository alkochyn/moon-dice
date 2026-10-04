import { getMiro } from "./sdk"

const escapeHtml = (text: string): string =>
  text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch] as string)

const STICKY_WIDTH = 220
/** Зазор между стикерами в столбике — чтобы они не слипались в один блок. */
const STACK_GAP = 20

const toContent = (lines: string[]): string => lines.map(escapeHtml).join("<br>")

/**
 * Дублирует результат броска на доску — на случай, когда партии удобнее видеть
 * бросок прямо в сцене, а не в панели. Каждый элемент stickers — строки одного
 * стикера; стикеры встают столбиком сверху вниз по центру экрана. Обычный
 * бросок — один стикер, инициатива — по стикеру на участника в порядке ходов,
 * чтобы их можно было двигать и вычёркивать по отдельности.
 */
export const postRollToBoard = async (stickers: string[][]): Promise<boolean> => {
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
    const top = await sdk.board.createStickyNote({ content: toContent(first), x, y: centerY, width: STICKY_WIDTH })
    if (rest.length === 0) return true

    const step = top.height + STACK_GAP
    top.y = centerY - (rest.length * step) / 2
    await top.sync()

    await Promise.all(
      rest.map((lines, index) =>
        sdk.board.createStickyNote({
          content: toContent(lines),
          x,
          y: top.y + (index + 1) * step,
          width: STICKY_WIDTH,
        }),
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
