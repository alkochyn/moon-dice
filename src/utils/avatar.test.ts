import { describe, expect, it } from "vitest"
import { AVATAR_COLORS, defaultColor, defaultIconId, initials, randomColor, randomIconId } from "./avatar"
import { ICONS, ICON_IDS } from "../data/icons"

describe("инициалы", () => {
  it("берёт первые буквы двух слов", () => {
    expect(initials("Alex Kochyn")).toBe("AK")
  })

  it("из одного слова берёт одну букву", () => {
    expect(initials("Юнис")).toBe("Ю")
  })

  it("не захватывает третье слово", () => {
    expect(initials("Пётр Иванович Сидоров")).toBe("ПИ")
  })

  it("переживает лишние пробелы", () => {
    expect(initials("  степан   ")).toBe("С")
  })

  it("не ломается на пустом имени", () => {
    expect(initials("")).toBe("?")
    expect(initials("   ")).toBe("?")
  })

  it("работает с эмодзи в имени", () => {
    // Спред по кодовым точкам, а не по символам: иначе от эмодзи остаётся половина.
    expect(initials("🌙 мастер")).toBe("🌙М")
  })
})

describe("внешность по умолчанию", () => {
  it("один и тот же id всегда даёт одну и ту же иконку и цвет", () => {
    expect(defaultIconId("user-42")).toBe(defaultIconId("user-42"))
    expect(defaultColor("user-42")).toBe(defaultColor("user-42"))
  })

  it("выдаёт иконку из набора и цвет из палитры", () => {
    expect(ICON_IDS).toContain(defaultIconId("кто-то"))
    expect(AVATAR_COLORS).toContain(defaultColor("кто-то") as (typeof AVATAR_COLORS)[number])
  })

  it("разводит игроков по разным иконкам", () => {
    const icons = new Set(Array.from({ length: 20 }, (_, i) => defaultIconId(`u${i}`)))
    expect(icons.size).toBeGreaterThan(10)
  })

  it("разводит игроков по разным цветам", () => {
    const colors = new Set(Array.from({ length: 20 }, (_, i) => defaultColor(`u${i}`)))
    expect(colors.size).toBeGreaterThan(5)
  })

  it("иконка и цвет берутся из разных хешей", () => {
    // Иначе выбор цвета был бы жёстко связан с выбором иконки.
    const pairs = new Set(Array.from({ length: 30 }, (_, i) => `${defaultIconId(`u${i}`)}|${defaultColor(`u${i}`)}`))
    expect(pairs.size).toBeGreaterThan(20)
  })
})

describe("случайный выбор", () => {
  it("всегда возвращает существующую иконку", () => {
    for (let i = 0; i < 50; i++) expect(ICONS.has(randomIconId())).toBe(true)
  })

  it("всегда возвращает цвет из палитры", () => {
    for (let i = 0; i < 50; i++) {
      expect(AVATAR_COLORS).toContain(randomColor() as (typeof AVATAR_COLORS)[number])
    }
  })
})

describe("набор иконок", () => {
  it("содержит все 85 значков", () => {
    expect(ICON_IDS).toHaveLength(85)
  })

  it("у каждой иконки есть путь", () => {
    for (const id of ICON_IDS) {
      expect(ICONS.get(id)?.length ?? 0).toBeGreaterThan(20)
    }
  })

  it("чёрная подложка из исходников вырезана", () => {
    // game-icons отдаёт иконку белым по чёрному квадрату; квадрат нам не нужен,
    // иначе в журнале будут чёрные плашки вместо значков.
    for (const id of ICON_IDS) {
      expect(ICONS.get(id)).not.toContain("M0 0h512v512H0z")
    }
  })

  it("идентификаторы не повторяются", () => {
    expect(new Set(ICON_IDS).size).toBe(ICON_IDS.length)
  })
})
