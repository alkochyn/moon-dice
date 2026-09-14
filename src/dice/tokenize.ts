import { DiceError } from "./types"

export type TokenType = "number" | "d" | "ident" | "op" | "lparen" | "rparen" | "hash" | "bang" | "eof"

export interface Token {
  type: TokenType
  value: string
  pos: number
}

const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9"
const isLetter = (ch: string): boolean => /[a-zA-Zа-яёА-ЯЁ]/.test(ch)

export const tokenize = (input: string): Token[] => {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i] as string

    if (ch === " " || ch === "\t") {
      i++
      continue
    }

    if (isDigit(ch)) {
      const start = i
      while (i < input.length && isDigit(input[i] as string)) i++
      tokens.push({ type: "number", value: input.slice(start, i), pos: start })
      continue
    }

    if (isLetter(ch)) {
      const start = i
      while (i < input.length && isLetter(input[i] as string)) i++
      const word = input.slice(start, i).toLowerCase()
      // Одиночная `d` — знак куба, всё остальное — модификатор (kh, kl, adv, dis).
      tokens.push({ type: word === "d" ? "d" : "ident", value: word, pos: start })
      continue
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "×" || ch === "÷") {
      const normalized = ch === "×" ? "*" : ch === "÷" ? "/" : ch
      tokens.push({ type: "op", value: normalized, pos: i })
      i++
      continue
    }

    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch, pos: i })
      i++
      continue
    }

    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch, pos: i })
      i++
      continue
    }

    if (ch === "#") {
      tokens.push({ type: "hash", value: ch, pos: i })
      i++
      continue
    }

    if (ch === "!") {
      tokens.push({ type: "bang", value: ch, pos: i })
      i++
      continue
    }

    throw new DiceError(`Непонятный символ «${ch}»`, i)
  }

  tokens.push({ type: "eof", value: "", pos: input.length })

  return tokens
}
