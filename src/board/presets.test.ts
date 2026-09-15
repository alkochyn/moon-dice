import { describe, expect, it } from "vitest"
import { reorderPresets, type Preset } from "./presets"

const list = (...ids: string[]): Preset[] =>
  ids.map((id) => ({ id, name: id, formula: "1d6", color: "slate" }))

const ids = (items: Preset[]): string[] => items.map((item) => item.id)

describe("перестановка сохранённых бросков", () => {
  it("двигает бросок вперёд, на место цели", () => {
    expect(ids(reorderPresets(list("a", "b", "c", "d"), "a", "c"))).toEqual(["b", "c", "a", "d"])
  })

  it("двигает бросок назад, на место цели", () => {
    expect(ids(reorderPresets(list("a", "b", "c", "d"), "d", "b"))).toEqual(["a", "d", "b", "c"])
  })

  it("меняет местами соседей", () => {
    expect(ids(reorderPresets(list("a", "b"), "b", "a"))).toEqual(["b", "a"])
  })

  it("возвращает прежний массив, если бросок уронили на себя", () => {
    const items = list("a", "b")
    expect(reorderPresets(items, "a", "a")).toBe(items)
  })

  it("не теряет броски при неизвестных идентификаторах", () => {
    const items = list("a", "b")
    expect(reorderPresets(items, "x", "a")).toBe(items)
    expect(reorderPresets(items, "a", "x")).toBe(items)
  })

  it("никогда не теряет и не дублирует записи", () => {
    const items = list("a", "b", "c", "d", "e")
    for (const from of ids(items)) {
      for (const to of ids(items)) {
        const next = reorderPresets(items, from, to)
        expect(next).toHaveLength(items.length)
        expect(new Set(ids(next)).size).toBe(items.length)
      }
    }
  })
})
