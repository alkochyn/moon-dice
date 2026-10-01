import { describe, expect, it } from "vitest"
import { reorderPresets, type Preset } from "./presets"

const list = (...ids: string[]): Preset[] =>
  ids.map((id) => ({ id, name: id, formula: "1d6", color: "slate" }))

const ids = (items: Preset[]): string[] => items.map((item) => item.id)

describe("перестановка сохранённых бросков", () => {
  it("двигает бросок вперёд, в промежуток между оставшимися", () => {
    // Без «a» остаются b, c, d; промежуток 2 — между c и d.
    expect(ids(reorderPresets(list("a", "b", "c", "d"), "a", 2))).toEqual(["b", "c", "a", "d"])
  })

  it("двигает бросок назад", () => {
    expect(ids(reorderPresets(list("a", "b", "c", "d"), "d", 1))).toEqual(["a", "d", "b", "c"])
  })

  it("ставит в начало и в конец", () => {
    expect(ids(reorderPresets(list("a", "b", "c"), "c", 0))).toEqual(["c", "a", "b"])
    expect(ids(reorderPresets(list("a", "b", "c"), "a", 2))).toEqual(["b", "c", "a"])
  })

  it("возвращает прежний массив, если бросок вернули на его место", () => {
    const items = list("a", "b", "c")
    expect(reorderPresets(items, "b", 1)).toBe(items)
  })

  it("не теряет броски при неизвестном идентификаторе и зажимает индекс", () => {
    const items = list("a", "b")
    expect(reorderPresets(items, "x", 0)).toBe(items)
    expect(ids(reorderPresets(items, "a", 99))).toEqual(["b", "a"])
  })

  it("никогда не теряет и не дублирует записи", () => {
    const items = list("a", "b", "c", "d", "e")
    for (const from of ids(items)) {
      for (let to = 0; to < items.length; to++) {
        const next = reorderPresets(items, from, to)
        expect(next).toHaveLength(items.length)
        expect(new Set(ids(next)).size).toBe(items.length)
      }
    }
  })
})
