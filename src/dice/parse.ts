import { DiceError, type DiceErrorCode, type Node, type ParsedFormula } from "./types"
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

  private expectNumber(code: DiceErrorCode): { value: number; pos: number } {
    const token = this.peek()
    if (token.type !== "number") {
      throw new DiceError(code, {}, token.pos)
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
        throw new DiceError("unclosedParen", {}, closing.pos)
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
      throw new DiceError("unexpectedEnd", {}, token.pos)
    }

    throw new DiceError("unexpectedToken", { value: token.value }, token.pos)
  }

  private parseDice(count: number, startPos: number): Node {
    const dToken = this.next() // сам знак `d`

    if (this.peek().type !== "number") {
      throw new DiceError("needSides", {}, dToken.pos + 1)
    }
    const { value: sides, pos: sidesPos } = this.expectNumber("expectedSides")

    if (count < 1 || count > LIMITS.maxCount) {
      throw new DiceError("countRange", { max: LIMITS.maxCount }, startPos)
    }
    if (sides < 1 || sides > LIMITS.maxSides) {
      throw new DiceError("sidesRange", { max: LIMITS.maxSides }, sidesPos)
    }

    const node: Node = { kind: "dice", count, sides, explode: false, paren: false }

    for (;;) {
      const token = this.peek()

      if (token.type === "bang") {
        this.next()
        if (sides < 2) {
          throw new DiceError("explodeD1", {}, token.pos)
        }
        node.explode = true
        continue
      }

      if (token.type !== "ident") break

      if (token.value === "kh" || token.value === "kl") {
        this.next()
        const n = this.peek().type === "number" ? this.expectNumber("expectedKeepCount").value : 1
        if (n < 1 || n > node.count) {
          throw new DiceError("keepRange", { max: node.count }, token.pos)
        }
        node.keep = { mode: token.value === "kh" ? "h" : "l", n }
        continue
      }

      if (token.value === "adv" || token.value === "dis") {
        this.next()
        if (node.count !== 1) {
          throw new DiceError("singleDieOnly", { value: token.value }, token.pos)
        }
        node.count = 2
        node.keep = { mode: token.value === "adv" ? "h" : "l", n: 1 }
        continue
      }

      throw new DiceError("unknownModifier", { value: token.value }, token.pos)
    }

    this.diceBudget -= node.count
    if (this.diceBudget < 0) {
      throw new DiceError("tooManyDice", { max: LIMITS.maxDicePerRoll }, startPos)
    }

    return node
  }

  parseRepeat(): number {
    const first = this.peek()
    const second = this.tokens[this.pos + 1]

    if (first.type === "number" && second?.type === "hash") {
      const repeat = Number(first.value)
      if (repeat < 1 || repeat > LIMITS.maxRepeat) {
        throw new DiceError("repeatRange", { max: LIMITS.maxRepeat }, first.pos)
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
      throw new DiceError("trailing", { value: token.value }, token.pos)
    }
  }
}

export const parseFormula = (source: string): ParsedFormula => {
  const colon = source.indexOf(":")
  const rawExpression = (colon === -1 ? source : source.slice(0, colon)).trim()
  const rawLabel = colon === -1 ? "" : source.slice(colon + 1).trim()

  if (!rawExpression) {
    throw new DiceError("empty", {}, 0)
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
