import { afterEach, describe, expect, it } from "vitest"
import { postRollToBoard } from "./post"

interface FakeSticky {
  content: string
  x: number
  y: number
  width: number
  height: number
  sync: () => Promise<void>
}

const STICKY_HEIGHT = 100

/** Подменная доска: вьюпорт с центром в (500, 300), стикеры фиксированной высоты. */
const fakeBoard = (): FakeSticky[] => {
  const created: FakeSticky[] = []
  ;(globalThis as { miro?: unknown }).miro = {
    board: {
      viewport: { get: async () => ({ x: 0, y: 0, width: 1000, height: 600 }) },
      createStickyNote: async (props: Omit<FakeSticky, "height" | "sync">) => {
        const sticky = { ...props, height: STICKY_HEIGHT, sync: async () => {} }
        created.push(sticky)
        return sticky
      },
    },
  }
  return created
}

afterEach(() => {
  delete (globalThis as { miro?: unknown }).miro
})

describe("стикеры броска на доске", () => {
  it("обычный бросок — один стикер в центре экрана", async () => {
    const created = fakeBoard()
    expect(await postRollToBoard([["Игрок", "1d20 = 15"]])).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ content: "Игрок<br>1d20 = 15", x: 500, y: 300 })
  })

  it("инициатива — по стикеру на участника, столбиком сверху вниз по центру", async () => {
    const created = fakeBoard()
    await postRollToBoard([["1. Арвен — 18"], ["2. Гоблин 1 — 12"], ["3. Гоблин 2 — 7"]])

    expect(created.map((sticky) => sticky.content)).toEqual(["1. Арвен — 18", "2. Гоблин 1 — 12", "3. Гоблин 2 — 7"])
    expect(created.every((sticky) => sticky.x === 500)).toBe(true)

    const ys = created.map((sticky) => sticky.y)
    // Шаг — высота стикера плюс зазор, а середина столбика — центр экрана.
    expect(ys[1]! - ys[0]!).toBe(ys[2]! - ys[1]!)
    expect(ys[1]! - ys[0]!).toBeGreaterThan(STICKY_HEIGHT)
    expect((ys[0]! + ys[2]!) / 2).toBe(300)
  })

  it("без доски ничего не постит", async () => {
    expect(await postRollToBoard([["1. Арвен — 18"]])).toBe(false)
  })
})
