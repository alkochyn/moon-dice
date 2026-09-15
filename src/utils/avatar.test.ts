import { describe, expect, it } from "vitest"
import { avatarColor, initials } from "./avatar"

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

describe("цвет аватарки", () => {
  it("один и тот же id всегда даёт один и тот же цвет", () => {
    expect(avatarColor("user-42")).toBe(avatarColor("user-42"))
  })

  it("разные игроки получают разные цвета", () => {
    const colors = new Set(["u1", "u2", "u3", "u4", "u5", "u6"].map(avatarColor))
    expect(colors.size).toBeGreaterThan(4)
  })

  it("выдаёт корректный hsl в допустимом диапазоне", () => {
    const match = /^hsl\((\d+) 52% 42%\)$/.exec(avatarColor("кто-то"))
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeLessThan(360)
  })
})
