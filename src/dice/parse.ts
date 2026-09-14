import { DiceError, type Node, type ParsedFormula } from "./types"
import { tokenize, type Token } from "./tokenize"

export const LIMITS = {
  maxCount: 500,
  maxSides: 10_000,
  maxRepeat: 50,
  maxDicePerRoll: 2_000,
  maxLabel: 120,
} as const

class Parser {
  private pos = 0
  private diceBudget = LIMITS.maxDicePerRoll

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos] as Token
  }

  private next(): Token {
    const token = this.tokens[this.pos] as Token
    if (token.type !== "eof") this.pos++
    return token
  }

  private expectNumber(what: string): { value: number; pos: number } {
    const token = this.peek()
    if (token.type !== "number") {
      throw new DiceError(`Ожидалось число: ${what}`, token.pos)
    }
    this.next()
    return { value: Number(token.value), pos: token.pos }
  }

  parseExpression(): Node {
    let left = this.parseTerm()

    for (;;) {
      const token = this.peek()
      if (token.type !== "op" || (token.value !== "+" && token.value !== "-")) break
      this.next()
      const right = this.parseTerm()
      left = { kind: "binary", op: token.value as "+" | "-", left, right, paren: false }
    }

    return left
  }

  private parseTerm(): Node {
    let left = this.parseFactor()

    for (;;) {
      const token = this.peek()
      if (token.type !== "op" || (token.value !== "*" && token.value !== "/")) break
      this.next()
      const right = this.parseFactor()
      left = { kind: "binary", op: token.value as "*" | "/", left, right, paren: false }
    }

    return left
  }

  private parseFactor(): Node {
    const token = this.peek()

    if (token.type === "op" && token.value === "-") {
      this.next()
      return { kind: "unary", operand: this.parseFactor(), paren: false }
    }
    if (token.type === "op" && token.value === "+") {
      this.next()
      return this.parseFactor()
    }

    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    const token = this.peek()

    if (token.type === "lparen") {
      this.next()
      const inner = this.parseExpression()
      const closing = this.peek()
      if (closing.type !== "rparen") {
        throw new DiceError("Не закрыта скобка", closing.pos)
      }
      this.next()
      inner.paren = true
      return inner
    }

    if (token.type === "d") {
      return this.parseDice(1, token.pos)
    }

    if (token.type === "number") {
      this.next()
      if (this.peek().type === "d") {
        return this.parseDice(Number(token.value), token.pos)
      }
      return { kind: "num", value: Number(token.value), paren: false }
    }

    if (token.type === "eof") {
      throw new DiceError("Формула обрывается — не хватает значения", token.pos)
    }

    throw new DiceError(`Здесь не ожидалось «${token.value}»`, token.pos)
  }

  private parseDice(count: number, startPos: number): Node {
    const dToken = this.next() // сам знак `d`

    if (this.peek().type !== "number") {
      throw new DiceError("После «d» нужно число граней, например d20", dToken.pos + 1)
    }
    const { value: sides, pos: sidesPos } = this.expectNumber("число граней куба")

    if (count < 1 || count > LIMITS.maxCount) {
      throw new DiceError(`Число кубов должно быть от 1 до ${LIMITS.maxCount}`, startPos)
    }
    if (sides < 1 || sides > LIMITS.maxSides) {
      throw new DiceError(`Число граней должно быть от 1 до ${LIMITS.maxSides}`, sidesPos)
    }

    const node: Node = { kind: "dice", count, sides, explode: false, paren: false }

    for (;;) {
      const token = this.peek()

      if (token.type === "bang") {
        this.next()
        if (sides < 2) {
          throw new DiceError("Взрывные кубы невозможны на d1 — бросок никогда не закончится", token.pos)
        }
        node.explode = true
        continue
      }

      if (token.type !== "ident") break

      if (token.value === "kh" || token.value === "kl") {
        this.next()
        const n = this.peek().type === "number" ? this.expectNumber("сколько кубов оставить").value : 1
        if (n < 1 || n > node.count) {
          throw new DiceError(`Оставить можно от 1 до ${node.count} кубов`, token.pos)
        }
        node.keep = { mode: token.value === "kh" ? "h" : "l", n }
        continue
      }

      if (token.value === "adv" || token.value === "dis") {
        this.next()
        if (node.count !== 1) {
          throw new DiceError(`«${token.value}» применяется к одному кубу: пишите d20${token.value}`, token.pos)
        }
        node.count = 2
        node.keep = { mode: token.value === "adv" ? "h" : "l", n: 1 }
        continue
      }

      throw new DiceError(`Непонятный модификатор «${token.value}»`, token.pos)
    }

    this.diceBudget -= node.count
    if (this.diceBudget < 0) {
      throw new DiceError(`Слишком много кубов в одной формуле (лимит ${LIMITS.maxDicePerRoll})`, startPos)
    }

    return node
  }

  parseRepeat(): number {
    const first = this.peek()
    const second = this.tokens[this.pos + 1]

    if (first.type === "number" && second?.type === "hash") {
      const repeat = Number(first.value)
      if (repeat < 1 || repeat > LIMITS.maxRepeat) {
        throw new DiceError(`Повторов должно быть от 1 до ${LIMITS.maxRepeat}`, first.pos)
      }
      this.next()
      this.next()
      return repeat
    }

    return 1
  }

  expectEnd(): void {
    const token = this.peek()
    if (token.type !== "eof") {
      throw new DiceError(`Лишнее в конце формулы: «${token.value}»`, token.pos)
    }
  }
}

export const parseFormula = (source: string): ParsedFormula => {
  const colon = source.indexOf(":")
  const rawExpression = (colon === -1 ? source : source.slice(0, colon)).trim()
  const rawLabel = colon === -1 ? "" : source.slice(colon + 1).trim()

  if (!rawExpression) {
    throw new DiceError("Пустая формула", 0)
  }

  const parser = new Parser(tokenize(rawExpression))
  const repeat = parser.parseRepeat()
  const ast = parser.parseExpression()
  parser.expectEnd()

  return {
    expression: rawExpression,
    repeat,
    ...(rawLabel ? { label: rawLabel.slice(0, LIMITS.maxLabel) } : {}),
    ast,
  }
}
