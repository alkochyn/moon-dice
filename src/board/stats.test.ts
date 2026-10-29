import { describe, expect, it } from "vitest"
import { hashId, teamFromToken } from "./stats"

const token = (claims: object): string => {
  const encode = (value: object): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return `${encode({ alg: "HS256" })}.${encode(claims)}.signature`
}

describe("обезличивание статистики", () => {
  it("даёт одному id один и тот же короткий хэш", async () => {
    const first = await hashId("uXjVKxxxxxx=")
    expect(first).toMatch(/^[0-9a-f]{16}$/)
    expect(await hashId("uXjVKxxxxxx=")).toBe(first)
  })

  it("разводит разные id", async () => {
    expect(await hashId("3458764600000000001")).not.toBe(await hashId("3458764600000000002"))
  })

  it("не хэширует пустоту: пустое поле в таблице честнее хэша пустой строки", async () => {
    expect(await hashId("")).toBe("")
  })
})

describe("команда из id-токена", () => {
  it("достаёт team из полезной нагрузки", () => {
    expect(teamFromToken(token({ sub: "1", team: "3458764500000000000" }))).toBe("3458764500000000000")
  })

  it("принимает числовой team", () => {
    expect(teamFromToken(token({ team: 42 }))).toBe("42")
  })

  it("переживает токен без команды и мусор вместо токена", () => {
    expect(teamFromToken(token({ sub: "1" }))).toBe("")
    expect(teamFromToken("")).toBe("")
    expect(teamFromToken("не.токен.вовсе")).toBe("")
  })
})
