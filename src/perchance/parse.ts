import { parseExpr, type Expr } from "./expr"

/**
 * Разбор кода генератора perchance: списки по отступам, веса `^2`, свойства
 * `name = value` и шаблоны строк с `[...]` и `{...}`.
 */

export type Weight = { kind: "fixed"; value: number } | { kind: "expr"; expr: ExprRef }

/** Выражение разбирается при первом обращении: неподдержанный JS в редко выпадающей строке не должен ронять всю таблицу. */
export interface ExprRef {
  source: string
  parsed?: Expr | Error
}

export type Segment =
  | { type: "text"; value: string }
  | { type: "expr"; expr: ExprRef }
  | { type: "choice"; options: Array<{ template: Template; weight: Weight }> }
  | { type: "range"; from: number; to: number }
  | { type: "letters"; from: number; to: number }
  | { type: "article"; upper: boolean }
  | { type: "plural" }
  | { type: "import"; name: string }

export type Template = Segment[]

export interface ListNode {
  kind: "list"
  name: string
  weight: Weight
  /** То, из чего выбирает бросок: строки и вложенные списки, по порядку. */
  items: Array<ListNode | ItemNode>
  /** Именованные дети: вложенные списки и свойства `name = value`. */
  named: Map<string, ListNode | PropNode>
  parent: ListNode | null
  /** Функция на JS: имя известно, исполнять — нет. */
  fn?: boolean
}

export interface ItemNode {
  kind: "item"
  text: Template
  weight: Weight
  parent: ListNode
}

export interface PropNode {
  kind: "prop"
  name: string
  value: Template
  parent: ListNode
}

export type Node = ListNode | ItemNode | PropNode

const NO_WEIGHT: Weight = { kind: "fixed", value: 1 }

/**
 * Табуляция считается за два пробела, как в редакторе perchance: в живых
 * генераторах один список бывает набран вперемешку табами и парой пробелов.
 */
const TAB_WIDTH = 2

const newList = (name: string, weight: Weight, parent: ListNode | null): ListNode => ({
  kind: "list",
  name,
  weight,
  items: [],
  named: new Map(),
  parent,
})

/**
 * `//` до конца строки — комментарий. Кроме экранированного `\/\/` и адресов
 * вида `https://`: двоеточие перед слешами комментарий не открывает.
 */
export const stripComment = (line: string): string => {
  for (let index = 0; index < line.length - 1; index++) {
    if (line[index] === "\\") {
      index++
      continue
    }
    if (line[index] === "/" && line[index + 1] === "/" && line[index - 1] !== ":") return line.slice(0, index)
  }
  return line
}

/**
 * Позиции символа на верхнем уровне строки: не внутри `[...]`, `{...}`,
 * кавычек в выражении и не после `\`.
 */
const topLevel = (text: string, wanted: string): number[] => {
  const found: number[] = []
  let square = 0
  let curly = 0
  let quote: string | null = null

  for (let index = 0; index < text.length; index++) {
    const ch = text[index]!
    if (ch === "\\") {
      index++
      continue
    }
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (square > 0 && (ch === '"' || ch === "'" || ch === "`")) quote = ch
    else if (ch === "[") square++
    else if (ch === "]") square = Math.max(0, square - 1)
    else if (ch === "{") curly++
    else if (ch === "}") curly = Math.max(0, curly - 1)
    else if (ch === wanted && square === 0 && curly === 0) found.push(index)
  }

  return found
}

/** Вес в конце строки: `goblin ^2`, `orc^0.5`, `elf ^[race == "elf"]`. */
export const splitWeight = (text: string): { text: string; weight: Weight } => {
  const carets = topLevel(text, "^")
  const last = carets[carets.length - 1]
  if (last === undefined) return { text, weight: NO_WEIGHT }

  const tail = text.slice(last + 1).trim()
  const head = text.slice(0, last).trimEnd()
  if (/^\d*\.?\d+$/.test(tail)) return { text: head, weight: { kind: "fixed", value: Number(tail) } }
  if (tail.startsWith("[") && findClose(tail, 0) === tail.length - 1) {
    return { text: head, weight: { kind: "expr", expr: { source: tail.slice(1, -1) } } }
  }

  // `silver^25[s = s + 25, ""]`: вес, а за ним выражения ради побочного
  // эффекта. Так пишут, чтобы вести счёт, — вес и выражения разводим.
  const number = /^\d*\.?\d+/.exec(tail)
  if (number && onlyExpressions(tail.slice(number[0].length))) {
    return { text: `${head}${tail.slice(number[0].length)}`, weight: { kind: "fixed", value: Number(number[0]) } }
  }
  return { text, weight: NO_WEIGHT }
}

const onlyExpressions = (text: string): boolean => {
  let rest = text.trim()
  if (!rest.startsWith("[")) return false
  while (rest) {
    if (!rest.startsWith("[")) return false
    const close = findClose(rest, 0)
    if (close < 0) return false
    rest = rest.slice(close + 1).trim()
  }
  return true
}

/**
 * Функции perchance — `name(args) =>` с JS-телом ниже или `name = (x) => …`.
 * Их мы не исполняем, но узнать нужно: иначе тело функции разобралось бы
 * как строки таблицы.
 */
const FN_HEADER_RE = /^([\p{L}_$][\p{L}\p{N}_$]*)\s*(?:=\s*)?(?:async\s+)?\([^)]*\)\s*=>/u
const FN_VALUE_RE = /^(?:async\s+)?(?:\([^)]*\)|[\p{L}_$][\p{L}\p{N}_$]*)\s*=>|^(?:async\s+)?function\b/u

const PROP_RE = /^([\p{L}_$][\p{L}\p{N}_$]*)\s*=(?!=)\s?(.*)$/u

/** Свойство `name = value` — только если слева честное имя, иначе это просто текст с «=». */
const splitProp = (text: string): { name: string; value: string } | null => {
  const match = PROP_RE.exec(text)
  return match ? { name: match[1]!, value: match[2]!.trim() } : null
}

/** Ищет закрывающую скобку с учётом вложенности и строк внутри выражений. */
const findClose = (text: string, start: number): number => {
  const open = text[start]
  let square = 0
  let curly = 0
  let quote: string | null = null

  for (let index = start; index < text.length; index++) {
    const ch = text[index]!
    if (ch === "\\") {
      index++
      continue
    }
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (square > 0 && (ch === '"' || ch === "'" || ch === "`")) quote = ch
    else if (ch === "[") square++
    else if (ch === "]") square--
    else if (ch === "{") curly++
    else if (ch === "}") curly--

    if ((open === "[" && square === 0) || (open === "{" && curly === 0 && square === 0)) return index
  }

  return -1
}

const TEXT_ESCAPES: Record<string, string> = { s: " ", n: "\n", t: "\t" }

const parseCurly = (inner: string): Segment => {
  const trimmed = inner.trim()

  const range = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(trimmed)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    return { type: "range", from: Math.min(a, b), to: Math.max(a, b) }
  }

  const letters = /^([a-zA-Z])-([a-zA-Z])$/.exec(trimmed)
  if (letters) {
    const a = letters[1]!.charCodeAt(0)
    const b = letters[2]!.charCodeAt(0)
    return { type: "letters", from: Math.min(a, b), to: Math.max(a, b) }
  }

  if (trimmed === "a" || trimmed === "A") return { type: "article", upper: trimmed === "A" }
  if (trimmed === "s") return { type: "plural" }

  const imported = /^import:\s*([\w-]+)$/.exec(trimmed)
  if (imported) return { type: "import", name: imported[1]! }

  const bars = topLevel(inner, "|")
  const parts: string[] = []
  let from = 0
  for (const bar of bars) {
    parts.push(inner.slice(from, bar))
    from = bar + 1
  }
  parts.push(inner.slice(from))

  return {
    type: "choice",
    options: parts.map((part) => {
      const { text, weight } = splitWeight(part)
      return { template: parseTemplate(text), weight }
    }),
  }
}

export const parseTemplate = (source: string): Template => {
  const segments: Template = []
  let text = ""

  const flush = (): void => {
    if (text) segments.push({ type: "text", value: text })
    text = ""
  }

  for (let index = 0; index < source.length; index++) {
    const ch = source[index]!

    if (ch === "\\" && index + 1 < source.length) {
      const next = source[index + 1]!
      text += TEXT_ESCAPES[next] ?? next
      index++
      continue
    }

    if (ch === "[" || ch === "{") {
      const close = findClose(source, index)
      // Непарная скобка — просто символ: так perchance и показывает.
      if (close < 0) {
        text += ch
        continue
      }

      flush()
      const inner = source.slice(index + 1, close)
      segments.push(ch === "[" ? { type: "expr", expr: { source: inner } } : parseCurly(inner))
      index = close
      continue
    }

    text += ch
  }

  flush()
  return segments
}

export const ensureExpr = (ref: ExprRef): Expr | Error => {
  if (!ref.parsed) {
    try {
      ref.parsed = parseExpr(ref.source)
    } catch (failure) {
      ref.parsed = failure instanceof Error ? failure : new Error(String(failure))
    }
  }
  return ref.parsed
}

const indentOf = (line: string): number => {
  let width = 0
  for (const ch of line) {
    if (ch === " ") width++
    else if (ch === "\t") width += TAB_WIDTH
    else break
  }
  return width
}

/** Корень генератора: список верхнего уровня, его дети — списки и свойства. */
export const parseGenerator = (code: string): ListNode => {
  const root = newList("", NO_WEIGHT, null)
  const lines = code
    .split(/\r?\n/)
    .map((raw) => {
      const stripped = stripComment(raw)
      return { indent: indentOf(stripped), text: stripped.trim() }
    })
    .filter((line) => line.text !== "")

  // Свойство с вложенными строками бессмысленно; детей уводим в никуда,
  // чтобы они не прилипли к соседнему списку.
  const sink = newList("", NO_WEIGHT, null)
  const stack: Array<{ indent: number; node: ListNode }> = [{ indent: -1, node: root }]

  lines.forEach((line, index) => {
    while (stack[stack.length - 1]!.indent >= line.indent) stack.pop()
    const parent = stack[stack.length - 1]!.node
    const next = lines[index + 1]
    const hasChildren = next !== undefined && next.indent > line.indent

    const prop = splitProp(line.text)
    const fnName = FN_HEADER_RE.exec(line.text)?.[1] ?? (prop && FN_VALUE_RE.test(prop.value) ? prop.name : null)
    if (fnName) {
      const fn = { ...newList(fnName, NO_WEIGHT, parent), fn: true }
      parent.named.set(fnName, fn)
      stack.push({ indent: line.indent, node: sink })
      return
    }

    if (prop) {
      parent.named.set(prop.name, { kind: "prop", name: prop.name, value: parseTemplate(prop.value), parent })
      if (hasChildren) stack.push({ indent: line.indent, node: sink })
      return
    }

    const { text, weight } = splitWeight(line.text)
    if (hasChildren || parent === root) {
      const list = newList(text, weight, parent)
      parent.items.push(list)
      parent.named.set(text, list)
      stack.push({ indent: line.indent, node: list })
      return
    }

    parent.items.push({ kind: "item", text: parseTemplate(text), weight, parent })
  })

  return root
}
