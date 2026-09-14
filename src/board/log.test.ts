import { describe, expect, it } from "vitest"
import { MAX_ENTRIES, mergeEntries, newId, type RollEntry } from "./log"

const entry = (id: string, ts: number): RollEntry => ({
  id,
  ts,
  userId: "u1",
  userName: "Игрок",
  expression: "1d20",
  results: [{ total: 10, detail: "[10]" }],
})

describe("сведение журнала бросков", () => {
  it("складывает записи из доски и из локальной копии", () => {
    const merged = mergeEntries([entry("a", 1)], [entry("b", 2)])
    expect(merged.map((item) => item.id)).toEqual(["b", "a"])
  })

  it("схлопывает дубли по id — своя запись не задвоится после ответа доски", () => {
    const merged = mergeEntries([entry("a", 1)], [entry("a", 1), entry("b", 2)])
    expect(merged).toHaveLength(2)
  })

  it("не теряет чужой бросок, прилетевший одновременно со своим", () => {
    const mine = entry("mine", 100)
    const theirs = entry("theirs", 100)
    const merged = mergeEntries([mine], [theirs])
    expect(merged.map((item) => item.id).sort()).toEqual(["mine", "theirs"])
  })

  it("обрезает журнал до лимита, оставляя свежие", () => {
    const many = Array.from({ length: MAX_ENTRIES + 50 }, (_, index) => entry(`e${index}`, index))
    const merged = mergeEntries(many)

    expect(merged).toHaveLength(MAX_ENTRIES)
    expect(merged[0]?.id).toBe(`e${MAX_ENTRIES + 49}`)
  })

  it("пропускает мусор из хранилища вместо падения", () => {
    const junk = [null, "строка", { ts: 1 }] as unknown as RollEntry[]
    expect(mergeEntries(junk, [entry("a", 1)])).toHaveLength(1)
  })

  it("выдаёт уникальные идентификаторы записей", () => {
    const ids = new Set(Array.from({ length: 500 }, newId))
    expect(ids.size).toBe(500)
  })
})
