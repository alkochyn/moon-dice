import { describe, expect, it } from "vitest"

import { rollFormula, type Rng } from "../../dice"
import { AsciiFire, bigNumber, dieArt, diceOf, naturalOf, rollArtOf, skullArt } from "./ascii"

const seq = (...values: number[]): Rng => {
  let i = 0
  return () => values[i++ % values.length] as number
}

/** Бросок как он попадёт в журнал: формула и строка разбора. */
const logged = (formula: string, ...values: number[]) => {
  const result = rollFormula(formula, seq(...values))
  return { expression: result.expression, detail: result.rolls[0]!.detail }
}

const dice = (formula: string, ...values: number[]) => {
  const { expression, detail } = logged(formula, ...values)
  return diceOf(expression, detail)
}

describe("кубы из записи журнала", () => {
  it("подставляет грани из формулы в порядке пулов", () => {
    expect(dice("1d20+2d6+3", 14, 4, 5)).toEqual([
      { sides: 20, value: 14, kept: true, exploded: false, sign: 1 },
      { sides: 6, value: 4, kept: true, exploded: false, sign: 1 },
      { sides: 6, value: 5, kept: true, exploded: false, sign: 1 },
    ])
  })

  it("помечает отброшенные кубы", () => {
    expect(dice("4d6kh3", 2, 5, 6, 3)?.map((die) => die.kept)).toEqual([false, true, true, true])
  })

  it("складывает цепочку взрыва в одно значение", () => {
    expect(dice("1d6!", 6, 6, 2)).toEqual([{ sides: 6, value: 14, kept: true, exploded: true, sign: 1 }])
  })

  it("понимает скобки и вычитание", () => {
    expect(dice("10-(1d4+1d8)", 3, 7)?.map((die) => die.sides)).toEqual([4, 8])
  })

  it("сдаётся, если разбор не сходится с формулой", () => {
    expect(diceOf("1d20+1d6", "[14]")).toBeNull()
    expect(diceOf("1d20", "[x]")).toBeNull()
    expect(diceOf("не формула", "[1]")).toBeNull()
  })
})

describe("кубы и модификатор для рисунка", () => {
  const art = (formula: string, ...values: number[]) => {
    const { expression, detail } = logged(formula, ...values)
    return rollArtOf(expression, detail)
  }

  it("складывает все постоянные слагаемые в одно число", () => {
    const result = art("1d20+1+1d4+5", 12, 3)
    expect(result?.dice.map((die) => [die.sides, die.value, die.sign])).toEqual([
      [20, 12, 1],
      [4, 3, 1],
    ])
    expect(result?.modifier).toBe(6)
    expect(result?.linear).toBe(true)
  })

  it("помнит знак у вычитаемых кубов и чисел", () => {
    const result = art("10-1d6-2", 4)
    expect(result?.dice.map((die) => die.sign)).toEqual([-1])
    expect(result?.modifier).toBe(8)
  })

  it("переворачивает знак внутри скобок после минуса", () => {
    const result = art("1d20-(1d4-3)", 9, 2)
    expect(result?.dice.map((die) => die.sign)).toEqual([1, -1])
    expect(result?.modifier).toBe(3)
  })

  it("помечает формулу с умножением как нелинейную", () => {
    expect(art("(1d6+2)*2", 3)?.linear).toBe(false)
  })
})

describe("натуральные 20 и 1", () => {
  it("ловит 20 и 1 на одиночном d20 с модификатором", () => {
    expect(naturalOf(dice("1d20+5", 20))).toBe("crit")
    expect(naturalOf(dice("1d20+5", 1))).toBe("fumble")
    expect(naturalOf(dice("1d20+5", 12))).toBeNull()
  })

  it("смотрит на засчитанный куб при преимуществе", () => {
    expect(naturalOf(dice("d20adv", 20, 3))).toBe("crit")
    expect(naturalOf(dice("d20dis", 20, 1))).toBe("fumble")
    expect(naturalOf(dice("d20adv", 1, 9))).toBeNull()
  })

  it("не выдумывает натуральную, когда d20 несколько или нет совсем", () => {
    expect(naturalOf(dice("2d20", 20, 20))).toBeNull()
    expect(naturalOf(dice("1d6", 1))).toBeNull()
    expect(naturalOf(null)).toBeNull()
  })
})

describe("рисунки", () => {
  it("рисует d6 точками, остальные числом", () => {
    expect(dieArt({ sides: 6, value: 5, kept: true, exploded: false, sign: 1 })).toBe(
      [".-d6--.", "|o   o|", "|  o  |", "|o   o|", "'-----'"].join("\n"),
    )
    expect(dieArt({ sides: 20, value: 17, kept: true, exploded: false, sign: 1 })).toBe(
      [".-d20-.", "|     |", "| 17  |", "|     |", "'-----'"].join("\n"),
    )
  })

  it("расширяет рамку под длинное число", () => {
    const rows = dieArt({ sides: 6, value: 1234, kept: true, exploded: true, sign: 1 }).split("\n")
    expect(new Set(rows.map((row) => row.length)).size).toBe(1)
    expect(rows[2]).toContain("1234")
  })

  it("выводит сумму в три строки, включая минус", () => {
    expect(bigNumber(-12).split("\n")).toEqual(["         _ ", " _    |  _|", "      | |_ "])
  })

  it("держит череп одной ширины в обоих кадрах", () => {
    const widths = (art: string) => art.split("\n").map((row) => row.length)
    expect(widths(skullArt(true))).toEqual(widths(skullArt(false)))
  })
})

describe("огонь", () => {
  it("отдаёт строки заданного размера и гаснет при догорании", () => {
    const noise = [0.1, 0.9, 0.5, 0.3, 0.7]
    let i = 0
    const fire = new AsciiFire(20, 8, () => noise[i++ % noise.length] as number)
    fire.reset()
    const rows = fire.rows()
    expect(rows).toHaveLength(8)
    expect(rows.every((row) => row.text.length === 20)).toBe(true)

    for (let i = 0; i < 40; i++) fire.step(true)
    expect(fire.rows().every((row) => row.level === 0)).toBe(true)
  })
})
