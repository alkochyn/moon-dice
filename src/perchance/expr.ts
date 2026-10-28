/**
 * Выражения в квадратных скобках. У perchance там настоящий JavaScript; мы
 * разбираем его безопасное подмножество, которого хватает таблицам:
 * `[list]`, `[x = list.selectOne, x.name]`, `[a == "b" ? c : d]`,
 * `[list.selectMany(3).joinItems(", ")]`, `[s = s + 10, ""]`.
 *
 * Функции, циклы, объекты и прочий JS — нет: их пришлось бы исполнять, а
 * исполнять чужой код в панели доски мы не будем.
 */

export type Expr =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "lit"; v: boolean | null | undefined }
  | { t: "id"; name: string }
  | { t: "this" }
  | { t: "member"; obj: Expr; name: string }
  | { t: "index"; obj: Expr; index: Expr }
  | { t: "call"; callee: Expr; args: Expr[] }
  | { t: "unary"; op: "!" | "-" | "+"; arg: Expr }
  | { t: "bin"; op: string; l: Expr; r: Expr }
  | { t: "cond"; test: Expr; yes: Expr; no: Expr }
  | { t: "assign"; op: "=" | "+=" | "-="; name: string; value: Expr }
  | { t: "seq"; list: Expr[] }

/** Разбор не удался: что именно не поняли — для сообщения игроку. */
export class ExprSyntaxError extends Error {}

type Token = { k: "num"; v: number } | { k: "str"; v: string } | { k: "id"; v: string } | { k: "op"; v: string }

const OPERATORS = [
  "===",
  "!==",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "+=",
  "-=",
  "(",
  ")",
  "[",
  "]",
  ".",
  ",",
  "?",
  ":",
  "=",
  "<",
  ">",
  "!",
  "+",
  "-",
  "*",
  "/",
  "%",
]

const IDENT_START = /[\p{L}_$]/u
const IDENT_PART = /[\p{L}\p{N}_$]/u

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0" }

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const ch = source[index]!

    if (/\s/.test(ch)) {
      index++
      continue
    }

    if (/\d/.test(ch) || (ch === "." && /\d/.test(source[index + 1] ?? ""))) {
      const match = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(source.slice(index))!
      tokens.push({ k: "num", v: Number(match[0]) })
      index += match[0].length
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      let value = ""
      index++
      while (index < source.length && source[index] !== ch) {
        if (source[index] === "\\" && index + 1 < source.length) {
          const next = source[index + 1]!
          value += ESCAPES[next] ?? next
          index += 2
          continue
        }
        if (ch === "`" && source[index] === "$" && source[index + 1] === "{") {
          throw new ExprSyntaxError("${…}")
        }
        value += source[index]
        index++
      }
      if (index >= source.length) throw new ExprSyntaxError(ch)
      index++
      tokens.push({ k: "str", v: value })
      continue
    }

    if (IDENT_START.test(ch)) {
      let end = index + 1
      while (end < source.length && IDENT_PART.test(source[end]!)) end++
      tokens.push({ k: "id", v: source.slice(index, end) })
      index = end
      continue
    }

    const op = OPERATORS.find((candidate) => source.startsWith(candidate, index))
    if (!op) throw new ExprSyntaxError(ch)
    tokens.push({ k: "op", v: op })
    index += op.length
  }

  return tokens
}

/** Слова JS, за которыми стоит то, чего мы не исполняем. */
const UNSUPPORTED_WORDS = new Set([
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "var",
  "let",
  "const",
  "new",
  "class",
  "await",
  "async",
  "import",
  "delete",
  "typeof",
  "window",
  "document",
  "eval",
])

const BINARY_LEVELS: string[][] = [
  ["||"],
  ["&&"],
  ["==", "!=", "===", "!=="],
  ["<", ">", "<=", ">="],
  ["+", "-"],
  ["*", "/", "%"],
]

export const parseExpr = (source: string): Expr => {
  const tokens = tokenize(source)
  let pos = 0

  const peek = (): Token | undefined => tokens[pos]
  const isOp = (value: string): boolean => {
    const token = tokens[pos]
    return token?.k === "op" && token.v === value
  }
  const expect = (value: string): void => {
    if (!isOp(value)) throw new ExprSyntaxError(describe(peek()) || value)
    pos++
  }

  const sequence = (): Expr => {
    const list = [assignment()]
    while (isOp(",")) {
      pos++
      list.push(assignment())
    }
    return list.length === 1 ? list[0]! : { t: "seq", list }
  }

  const assignment = (): Expr => {
    const token = peek()
    const next = tokens[pos + 1]
    if (token?.k === "id" && next?.k === "op" && (next.v === "=" || next.v === "+=" || next.v === "-=")) {
      pos += 2
      return { t: "assign", op: next.v, name: token.v, value: assignment() }
    }

    const test = binary(0)
    if (!isOp("?")) return test
    pos++
    const yes = assignment()
    expect(":")
    return { t: "cond", test, yes, no: assignment() }
  }

  const binary = (level: number): Expr => {
    if (level >= BINARY_LEVELS.length) return unary()

    let left = binary(level + 1)
    for (;;) {
      const token = peek()
      if (token?.k !== "op" || !BINARY_LEVELS[level]!.includes(token.v)) return left
      pos++
      left = { t: "bin", op: token.v, l: left, r: binary(level + 1) }
    }
  }

  const unary = (): Expr => {
    const token = peek()
    if (token?.k === "op" && (token.v === "!" || token.v === "-" || token.v === "+")) {
      pos++
      return { t: "unary", op: token.v, arg: unary() }
    }
    return postfix()
  }

  const postfix = (): Expr => {
    let expr = primary()
    for (;;) {
      if (isOp(".")) {
        pos++
        const name = peek()
        if (name?.k !== "id") throw new ExprSyntaxError(describe(name) || ".")
        pos++
        expr = { t: "member", obj: expr, name: name.v }
      } else if (isOp("(")) {
        pos++
        const args: Expr[] = []
        while (!isOp(")")) {
          args.push(assignment())
          if (!isOp(")")) expect(",")
        }
        pos++
        expr = { t: "call", callee: expr, args }
      } else if (isOp("[")) {
        pos++
        const index = sequence()
        expect("]")
        expr = { t: "index", obj: expr, index }
      } else {
        return expr
      }
    }
  }

  const primary = (): Expr => {
    const token = peek()
    if (!token) throw new ExprSyntaxError("…")
    pos++

    if (token.k === "num") return { t: "num", v: token.v }
    if (token.k === "str") return { t: "str", v: token.v }
    if (token.k === "op" && token.v === "(") {
      const inner = sequence()
      expect(")")
      return inner
    }
    if (token.k === "id") {
      if (token.v === "true") return { t: "lit", v: true }
      if (token.v === "false") return { t: "lit", v: false }
      if (token.v === "null") return { t: "lit", v: null }
      if (token.v === "undefined") return { t: "lit", v: undefined }
      if (token.v === "this") return { t: "this" }
      if (UNSUPPORTED_WORDS.has(token.v)) throw new ExprSyntaxError(token.v)
      return { t: "id", name: token.v }
    }

    throw new ExprSyntaxError(describe(token))
  }

  const expr = sequence()
  if (pos < tokens.length) throw new ExprSyntaxError(describe(peek()))
  return expr
}

const describe = (token: Token | undefined): string => {
  if (!token) return ""
  return token.k === "str" ? `"${token.v}"` : String(token.v)
}
