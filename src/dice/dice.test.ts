import { describe, expect, it } from "vitest"
import { rollFormula, validateFormula, DiceError, cryptoRng } from "./index"
import type { Rng } from "./random"

/** Кубы выдаются по списку — так проверяем разбор и формат, а не удачу. */
const seq = (...values: number[]): Rng => {
  let i = 0
  return () => values[i++ % values.length] as number
}

const roll = (formula: string, ...values: number[]) => rollFormula(formula, seq(...values))
const first = (formula: string, ...values: number[]) => roll(formula, ...values).rolls[0]!

describe("базовые формулы", () => {
  it("складывает кубы и модификатор", () => {
    const result = first("2d6+3", 4, 5)
    expect(result.total).toBe(12)
    expect(result.detail).toBe("[4, 5] + 3")
  })

  it("разбирает несколько разных кубов", () => {
    const result = first("1d20+1d5+6", 14, 3)
    expect(result.total).toBe(23)
    expect(result.detail).toBe("[14] + [3] + 6")
  })

  it("понимает куб без числа: d20", () => {
    expect(first("d20", 17).total).toBe(17)
  })

  it("считает голое число", () => {
    const result = first("7")
    expect(result.total).toBe(7)
    expect(result.detail).toBe("7")
  })

  it("поддерживает унарный минус", () => {
    expect(first("10-1d6", 4).total).toBe(6)
    expect(first("-1d6+10", 4).total).toBe(6)
  })
})

describe("приоритет операций и скобки", () => {
  it("умножение вперёд сложения", () => {
    expect(first("1+2*3").total).toBe(7)
  })

  it("скобки меняют порядок и сохраняются в разборе", () => {
    const result = first("(1+2)*3")
    expect(result.total).toBe(9)
    expect(result.detail).toBe("(1 + 2) * 3")
  })

  it("делит с округлением вниз", () => {
    expect(first("7/2").total).toBe(3)
    expect(first("1d10/3", 9).total).toBe(3)
  })

  it("ругается на деление на ноль", () => {
    expect(() => first("1d6/0", 3)).toThrow(DiceError)
  })
})

describe("модификаторы кубов", () => {
  it("kh3 отбрасывает худший куб", () => {
    const result = first("4d6kh3", 1, 5, 3, 6)
    expect(result.total).toBe(14)
    expect(result.detail).toBe("[(1), 5, 3, 6]")
  })

  it("kl1 оставляет худший", () => {
    const result = first("2d20kl1", 18, 4)
    expect(result.total).toBe(4)
    expect(result.detail).toBe("[(18), 4]")
  })

  it("kh без числа — это kh1", () => {
    expect(first("3d6kh", 2, 6, 4).total).toBe(6)
  })

  it("adv кидает два куба и берёт лучший", () => {
    const result = first("d20adv", 7, 19)
    expect(result.total).toBe(19)
    expect(result.detail).toBe("[(7), 19]")
  })

  it("dis берёт худший", () => {
    expect(first("d20dis", 7, 19).total).toBe(7)
  })

  it("взрывной куб продолжает бросок на максимуме", () => {
    const result = first("1d6!", 6, 6, 2)
    expect(result.total).toBe(14)
    expect(result.detail).toBe("[6!6!2]")
  })

  it("взрывной куб останавливается, если максимум не выпал", () => {
    expect(first("1d6!", 3, 6).total).toBe(3)
  })
})

describe("повторы и метки", () => {
  it("3# кидает формулу трижды", () => {
    const result = roll("3#1d20", 5, 10, 15)
    expect(result.rolls.map((r) => r.total)).toEqual([5, 10, 15])
    expect(result.total).toBe(30)
  })

  it("метка после двоеточия отделяется от формулы", () => {
    const result = roll("1d20+5 : атака гоблина", 12)
    expect(result.expression).toBe("1d20+5")
    expect(result.label).toBe("атака гоблина")
    expect(result.rolls[0]!.total).toBe(17)
  })

  it("формула без метки не выдумывает её", () => {
    expect(roll("1d20", 3).label).toBeUndefined()
  })
})

describe("ошибки разбора", () => {
  const bad: Array<[string, string]> = [
    ["", "пустая формула"],
    ["1d", "после d нет граней"],
    ["1d20+", "оборванная формула"],
    ["(1d6", "не закрыта скобка"],
    ["1d6)", "лишняя скобка"],
    ["2d6kh7", "оставить больше кубов, чем брошено"],
    ["1d1!", "взрыв на d1"],
    ["1d6zz", "неизвестный модификатор"],
    ["2d20adv", "adv на двух кубах"],
    ["1d6 $ 2", "посторонний символ"],
    ["600d6", "слишком много кубов"],
    ["1d20000", "слишком много граней"],
    ["99#1d6", "слишком много повторов"],
  ]

  it.each(bad)("«%s» — %s", (formula) => {
    expect(() => rollFormula(formula, seq(3))).toThrow(DiceError)
  })

  it("validateFormula возвращает позицию ошибки вместо исключения", () => {
    const result = validateFormula("1d20+")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/обрыв|не хватает/i)
      expect(result.pos).toBe(5)
    }
  })

  it("validateFormula пропускает корректную формулу", () => {
    expect(validateFormula("4d6kh3 + 2").ok).toBe(true)
  })

  it("показывает эмодзи в сообщении целиком, а не половину суррогатной пары", () => {
    const result = validateFormula("🙏")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("🙏")
  })

  it("не спотыкается об эмодзи в середине формулы", () => {
    const result = validateFormula("1d20+🎲")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("🎲")
      expect(result.pos).toBe(5)
    }
  })
})

describe("честность генератора", () => {
  it("d20 держится в границах и распределён ровно", () => {
    const counts = new Array<number>(21).fill(0)
    const n = 100_000
    const sides = 20

    for (let i = 0; i < n; i++) {
      const value = cryptoRng(sides)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(sides)
      counts[value] = (counts[value] as number) + 1
    }

    /*
     * Порог считаем от стандартного отклонения, а не «на глаз».
     *
     * Число выпадений грани — биномиальная величина, сигма = sqrt(n·p·(1-p)) ≈ 69.
     * Первый вариант этого теста брал ±4% от ожидания, то есть 2.9 сигмы, и
     * честный генератор заваливал его примерно раз в четырнадцать прогонов —
     * что и случилось на CI. Пять сигм дают ложное падение раз в ~87 тысяч
     * прогонов и при этом ловят любой реальный перекос: сдвиг диапазона или
     * выпадающая грань уходят за порог на порядки.
     */
    const expected = n / sides
    const sigma = Math.sqrt(n * (1 / sides) * (1 - 1 / sides))

    for (let face = 1; face <= sides; face++) {
      expect(Math.abs((counts[face] as number) - expected)).toBeLessThan(5 * sigma)
    }
  })

  it("d1 всегда выдаёт единицу", () => {
    for (let i = 0; i < 100; i++) expect(cryptoRng(1)).toBe(1)
  })
})
