import { describe, expect, it } from "vitest"

import type { Rng } from "../dice"
import { expandMonster, rollInitiative, type Combatant } from "./initiative"

/** Кубы и жребий выдаются по списку — проверяем порядок, а не удачу. */
const seq = (...values: number[]): Rng => {
  let i = 0
  return () => values[i++ % values.length] as number
}

const pc = (name: string, formula: string): Combatant => ({ name, formula, npc: false, userId: name })
const npc = (name: string, formula: string): Combatant => ({ name, formula, npc: true })

describe("expandMonster", () => {
  it("без повторителя — один участник на всю группу", () => {
    expect(expandMonster("1d20+1 : Гоблины", "Монстр")).toEqual([{ name: "Гоблины", formula: "1d20+1", npc: true }])
  })

  it("повторитель даёт пронумерованных участников", () => {
    const goblins = expandMonster("3#1d20+1 : Гоблин", "Монстр")
    expect(goblins.map((item) => item.name)).toEqual(["Гоблин 1", "Гоблин 2", "Гоблин 3"])
    expect(goblins.every((item) => item.formula === "1d20+1")).toBe(true)
  })

  it("без метки берёт запасное имя", () => {
    expect(expandMonster("d20", "Монстр")[0]?.name).toBe("Монстр")
  })
})

describe("rollInitiative", () => {
  it("выстраивает по убыванию", () => {
    const order = rollInitiative([pc("Мира", "1d20"), pc("Торвальд", "1d20+2"), npc("Гоблины", "1d20")], seq(5, 15, 9))
    expect(order.map((item) => [item.name, item.total])).toEqual([
      ["Торвальд", 17],
      ["Гоблины", 9],
      ["Мира", 5],
    ])
  })

  it("при ничьей игрок раньше монстра", () => {
    const order = rollInitiative([npc("Гоблин", "1d20+4"), pc("Мира", "1d20")], seq(10, 14))
    expect(order.map((item) => item.name)).toEqual(["Мира", "Гоблин"])
  })

  it("при ничьей между игроками раньше тот, у кого модификатор больше", () => {
    const order = rollInitiative([pc("Мира", "1d20"), pc("Торвальд", "1d20+3")], seq(12, 9))
    expect(order.map((item) => item.name)).toEqual(["Торвальд", "Мира"])
  })

  it("штраф тоже модификатор: -1 уступает нулю", () => {
    const order = rollInitiative([pc("Мира", "1d20-1"), pc("Торвальд", "1d20")], seq(11, 10))
    expect(order.map((item) => item.name)).toEqual(["Торвальд", "Мира"])
  })

  it("полная ничья решается жребием", () => {
    // Кубы: 10 и 10; жребий: 3 у Миры, 7 у Торвальда — больший жребий раньше.
    const order = rollInitiative([pc("Мира", "1d20"), pc("Торвальд", "1d20")], seq(10, 10, 3, 7))
    expect(order.map((item) => item.name)).toEqual(["Торвальд", "Мира"])
  })

  it("несёт расклад и внешность в результат", () => {
    const [first] = rollInitiative([{ ...pc("Мира", "1d20+2"), icon: "rogue", color: "#2563eb" }], seq(8))
    expect(first).toEqual({
      name: "Мира",
      expression: "1d20+2",
      total: 10,
      detail: "[8] + 2",
      npc: false,
      userId: "Мира",
      icon: "rogue",
      color: "#2563eb",
    })
  })
})
