import { describe, expect, it } from "vitest"
import { LOCAL_SCOPE, legacyPlan, scopedKey } from "./scope"

describe("пространство локальной копии", () => {
  it("даёт разным доскам разные ключи", () => {
    expect(scopedKey("dice.log.v1", "3458764600000000001")).not.toBe(scopedKey("dice.log.v1", "3458764600000000002"))
  })

  it("не путает доску с работой вне доски", () => {
    expect(scopedKey("dice.log.v1", LOCAL_SCOPE)).not.toBe(scopedKey("dice.log.v1", "3458764600000000001"))
  })

  it("разводит ключи одной доски между собой", () => {
    const board = "3458764600000000001"
    expect(scopedKey("dice.log.v1", board)).not.toBe(scopedKey("dice.presets.v1", board))
  })

  it("не тащит на доску журнал, накопленный до разделения", () => {
    const plan = legacyPlan("3458764600000000001")

    expect(plan.adopt).not.toContain("dice.log.v1")
    expect(plan.drop).toContain("dice.log.v1")
  })

  it("забирает сохранённые броски, чтобы игрок их не потерял", () => {
    expect(legacyPlan("3458764600000000001").adopt).toContain("dice.presets.v1")
  })

  it("забирает имя персонажа: на новых досках игрок назовётся заново", () => {
    expect(legacyPlan("3458764600000000001").adopt).toContain("dice.character.v1")
  })

  it("вне доски забирает и журнал: это та же самая история", () => {
    const plan = legacyPlan(LOCAL_SCOPE)

    expect(plan.adopt).toContain("dice.log.v1")
    expect(plan.drop).toEqual([])
  })
})
