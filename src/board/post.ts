import { getMiro } from "./sdk"

const escapeHtml = (text: string): string =>
  text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch] as string)

/**
 * Дублирует результат броска стикером на доску — на случай, когда партии
 * удобнее видеть бросок прямо в сцене, а не в панели.
 */
export const postRollToBoard = async (lines: string[]): Promise<boolean> => {
  const sdk = getMiro()
  if (!sdk) return false

  try {
    const viewport = await sdk.board.viewport.get()
    await sdk.board.createStickyNote({
      content: lines.map(escapeHtml).join("<br>"),
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
      width: 220,
    })
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
