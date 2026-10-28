import { ensureExpr, parseGenerator, type ItemNode, type ListNode, type Node, type PropNode, type Template, type Weight } from "./parse"
import type { Expr } from "./expr"
import {
  ARTICLE_LOWER,
  ARTICLE_UPPER,
  htmlToText,
  pluralForm,
  resolveArticles,
  sentenceCase,
  singularForm,
  titleCase,
} from "./text"

/**
 * Исполнение генератора perchance. Значения — как в JS (строки, числа,
 * булевы), плюс узлы списков: список при выводе каждый раз выбирает заново,
 * как и в оригинале.
 */

export type PerchanceErrorCode =
  | "unknownName"
  | "unsupported"
  | "notCallable"
  | "noOutput"
  | "importMissing"
  | "tooDeep"
  | "empty"
  | "network"
  | "notFound"
  | "badLink"

export class PerchanceError extends Error {
  constructor(
    readonly code: PerchanceErrorCode,
    readonly detail = "",
  ) {
    super(`${code}${detail ? `: ${detail}` : ""}`)
    this.name = "PerchanceError"
  }
}

/** Случайное число в [0, 1). */
export type Random = () => number

export const cryptoRandom: Random = () => {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return (buf[0] as number) / 0x1_0000_0000
}

/** Неизвестное имя: само по себе не ошибка (`s = s + 10`), ошибка — вывести его. */
class Missing {
  constructor(readonly name: string) {}
}

/** `list.consumableList`: каждый вывод забирает строку, пока не кончатся. */
class Consumable {
  constructor(
    readonly source: ListNode,
    readonly left: Array<ListNode | ItemNode>,
  ) {}
}

type Fn = (...args: Value[]) => Value
type Value = string | number | boolean | null | undefined | Node | Missing | Consumable | Fn | Value[]

/** Генераторы, которые пришли с сервера: имя → код. */
export type Sources = Record<string, string>

/** Предохранители от зацикленных генераторов: самоссылка не должна вешать панель. */
const MAX_DEPTH = 120
const MAX_STEPS = 200_000
export const MAX_OUTPUT = 4000

/** Настройки страницы perchance, а не таблицы: в выбор списка их не выносим. */
const PAGE_SETTINGS = new Set([
  "title",
  "subtitle",
  "description",
  "buttonText",
  "fontSize",
  "fontColor",
  "fontFamily",
  "numberOfItems",
  "itemSeperator",
  "itemSeparator",
  "backgroundColor",
  "backgroundImage",
  "linkColor",
  "imageUrl",
])

const IDENT_RE = /^[\p{L}_$][\p{L}\p{N}_$]*$/u

const parsedCache = new WeakMap<Sources, Map<string, ListNode>>()

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value

const rootOf = (node: Node): ListNode => {
  let current: ListNode = node.kind === "list" ? node : node.parent
  while (current.parent) current = current.parent
  return current
}

class Runtime {
  private depth = 0
  private steps = 0
  /** Переменные броска — свои у каждого генератора, как глобальные у оригинала. */
  private readonly vars = new Map<ListNode, Map<string, Value>>()

  constructor(
    private readonly sources: Sources,
    private readonly random: Random,
  ) {}

  root(name: string): ListNode {
    let cache = parsedCache.get(this.sources)
    if (!cache) {
      cache = new Map()
      parsedCache.set(this.sources, cache)
    }

    const cached = cache.get(name)
    if (cached) return cached

    const code = this.sources[name]
    if (code === undefined) throw new PerchanceError("importMissing", name)
    const parsed = parseGenerator(code)
    cache.set(name, parsed)
    return parsed
  }

  private tick(): void {
    if (++this.steps > MAX_STEPS) throw new PerchanceError("tooDeep")
  }

  private nested<T>(run: () => T): T {
    if (++this.depth > MAX_DEPTH) throw new PerchanceError("tooDeep")
    try {
      return run()
    } finally {
      this.depth--
    }
  }

  /* ---------- вывод ---------- */

  renderTemplate(template: Template, self: ListNode): string {
    let out = ""

    for (const segment of template) {
      this.tick()
      switch (segment.type) {
        case "text":
          out += segment.value
          break
        case "expr":
          out += this.render(this.evalRef(segment.expr, self))
          break
        case "choice": {
          const option = this.pick(segment.options, (option) => option.weight, self)
          if (option) out += this.nested(() => this.renderTemplate(option.template, self))
          break
        }
        case "range":
          out += String(segment.from + Math.floor(this.random() * (segment.to - segment.from + 1)))
          break
        case "letters":
          out += String.fromCharCode(segment.from + Math.floor(this.random() * (segment.to - segment.from + 1)))
          break
        case "article":
          out += segment.upper ? ARTICLE_UPPER : ARTICLE_LOWER
          break
        case "plural": {
          // {s} смотрит на последнее число перед собой: «1 coin», «3 coins».
          const number = /(-?\d+(?:\.\d+)?)\D*$/.exec(out.replace(/<[^>]*>/g, ""))
          out += number && Number(number[1]) === 1 ? "" : "s"
          break
        }
        case "import":
          out += this.render(this.root(segment.name))
          break
      }
    }

    return resolveArticles(out)
  }

  render(value: Value): string {
    if (value instanceof Missing) throw new PerchanceError("unknownName", value.name)
    if (value instanceof Consumable) return this.render(this.consume(value))
    if (typeof value === "function") throw new PerchanceError("unsupported", "function")
    if (Array.isArray(value)) return value.map((item) => this.render(item)).join(",")
    if (isNode(value)) return this.renderNode(value)
    if (value === undefined || value === null) return ""
    return String(value)
  }

  renderNode(node: Node): string {
    return this.nested(() => {
      if (node.kind === "item") return this.renderTemplate(node.text, node.parent)
      if (node.kind === "prop") {
        const alias = this.aliasOf(node)
        return alias ? this.renderNode(alias) : this.renderTemplate(node.value, node.parent)
      }

      if (node.fn) throw new PerchanceError("unsupported", `${node.name}()`)

      // Список с $output выводится через него: так оформляют вывод целиком.
      const custom = node.named.get("$output")
      if (custom?.kind === "prop") return this.renderTemplate(custom.value, node)
      if (custom?.fn) throw new PerchanceError("unsupported", "$output()")

      if (!node.parent) {
        const output = node.named.get("output")
        if (!output) throw new PerchanceError("noOutput")
        return this.renderNode(output)
      }

      const chosen = this.pick(node.items, (item) => item.weight, node)
      return chosen ? this.renderNode(chosen) : ""
    })
  }

  /** Свойство `x = {import:gen}` — это сам импортированный генератор, а не строка. */
  private aliasOf(prop: PropNode): ListNode | null {
    const [only, ...rest] = prop.value
    return only?.type === "import" && rest.length === 0 ? this.root(only.name) : null
  }

  /* ---------- выбор ---------- */

  private weightOf(weight: Weight, self: ListNode): number {
    if (weight.kind === "fixed") return weight.value
    const value = this.primitive(this.evalRef(weight.expr, self))
    const number = typeof value === "boolean" ? Number(value) : Number(value)
    return Number.isFinite(number) && number > 0 ? number : 0
  }

  private pick<T>(options: T[], weightOf: (option: T) => Weight, self: ListNode): T | undefined {
    if (options.length === 0) return undefined
    const weights = options.map((option) => this.weightOf(weightOf(option), self))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    if (total <= 0) return undefined

    let roll = this.random() * total
    for (let index = 0; index < options.length; index++) {
      roll -= weights[index]!
      if (roll < 0) return options[index]
    }
    return options[options.length - 1]
  }

  /** Строку выбора вычисляем сразу: `[g = gender.selectOne]` дальше везде одинаковый. */
  private selectOne(list: ListNode): Value {
    const chosen = this.pick(list.items, (item) => item.weight, list)
    if (!chosen) return ""
    return chosen.kind === "item" ? this.renderNode(chosen) : chosen
  }

  private selectUnique(list: ListNode, count: number): Value[] {
    const pool = [...list.items]
    const out: Value[] = []
    while (out.length < count && pool.length > 0) {
      const chosen = this.pick(pool, (item) => item.weight, list)
      if (!chosen) break
      pool.splice(pool.indexOf(chosen), 1)
      out.push(chosen.kind === "item" ? this.renderNode(chosen) : chosen)
    }
    return out
  }

  private consume(consumable: Consumable): Value {
    const chosen = this.pick(consumable.left, (item) => item.weight, consumable.source)
    if (!chosen) return ""
    consumable.left.splice(consumable.left.indexOf(chosen), 1)
    return chosen.kind === "item" ? this.renderNode(chosen) : chosen
  }

  /** `selectMany(3)` или `selectMany(1, 4)` — сколько брать. */
  private count(args: Value[]): number {
    const [a, b] = args.map((arg) => Number(this.primitive(arg)))
    if (b === undefined || !Number.isFinite(b)) return Math.max(0, Math.floor(a ?? 1))
    const low = Math.ceil(Math.min(a!, b))
    const high = Math.floor(Math.max(a!, b))
    return Math.max(0, low + Math.floor(this.random() * (high - low + 1)))
  }

  /* ---------- выражения ---------- */

  private evalRef(ref: { source: string; parsed?: Expr | Error }, self: ListNode): Value {
    const parsed = ensureExpr(ref)
    if (parsed instanceof Error) throw new PerchanceError("unsupported", `[${ref.source}]`)
    return this.nested(() => this.evaluate(parsed, self))
  }

  /** Узлы в арифметике и сравнениях ведут себя как их текст — как toString в JS. */
  primitive(value: Value): string | number | boolean | null | undefined {
    if (value instanceof Missing) return undefined
    if (typeof value === "function") throw new PerchanceError("unsupported", "function")
    if (isNode(value) || value instanceof Consumable || Array.isArray(value)) return this.render(value)
    return value
  }

  private scope(self: ListNode): Map<string, Value> {
    const root = rootOf(self)
    let vars = this.vars.get(root)
    if (!vars) {
      vars = new Map()
      this.vars.set(root, vars)
    }
    return vars
  }

  private lookup(name: string, self: ListNode): Value {
    const vars = this.scope(self)
    if (vars.has(name)) return vars.get(name)

    // Имя в perchance всегда ищется от корня генератора, а не от соседей.
    const found = rootOf(self).named.get(name)
    if (found) return found.kind === "prop" ? (this.aliasOf(found) ?? found) : found

    if (name === "Math") return MATH_MARK
    return new Missing(name)
  }

  private evaluate(expr: Expr, self: ListNode): Value {
    this.tick()

    switch (expr.t) {
      case "num":
      case "str":
      case "lit":
        return expr.v
      case "this":
        return self
      case "id":
        return this.lookup(expr.name, self)
      case "seq": {
        let last: Value
        for (const item of expr.list) last = this.evaluate(item, self)
        return last
      }
      case "assign": {
        const value = this.evaluate(expr.value, self)
        const vars = this.scope(self)
        if (expr.op === "=") {
          vars.set(expr.name, value)
          return value
        }
        const current = this.primitive(this.lookup(expr.name, self))
        const right = this.primitive(value)
        const next = expr.op === "+=" ? (current as number) + (right as number) : (current as number) - (right as number)
        vars.set(expr.name, next)
        return next
      }
      case "cond":
        return this.truthy(this.evaluate(expr.test, self))
          ? this.evaluate(expr.yes, self)
          : this.evaluate(expr.no, self)
      case "unary": {
        const arg = this.evaluate(expr.arg, self)
        if (expr.op === "!") return !this.truthy(arg)
        const number = Number(this.primitive(arg))
        return expr.op === "-" ? -number : number
      }
      case "bin":
        return this.binary(expr, self)
      case "member":
        return this.member(this.evaluate(expr.obj, self), expr.name, null)
      case "index": {
        const obj = this.evaluate(expr.obj, self)
        const key = this.primitive(this.evaluate(expr.index, self))
        if (Array.isArray(obj) && typeof key === "number") return obj[key]
        return this.member(obj, String(key), null)
      }
      case "call": {
        const args = expr.args.map((arg) => this.evaluate(arg, self))
        if (expr.callee.t === "member") return this.member(this.evaluate(expr.callee.obj, self), expr.callee.name, args)
        const callee = this.evaluate(expr.callee, self)
        if (typeof callee === "function") return callee(...args)
        throw new PerchanceError("notCallable", expr.callee.t === "id" ? expr.callee.name : "")
      }
    }
  }

  private truthy(value: Value): boolean {
    return Boolean(this.primitive(value))
  }

  private binary(expr: Extract<Expr, { t: "bin" }>, self: ListNode): Value {
    if (expr.op === "&&") {
      const left = this.evaluate(expr.l, self)
      return this.truthy(left) ? this.evaluate(expr.r, self) : left
    }
    if (expr.op === "||") {
      const left = this.evaluate(expr.l, self)
      return this.truthy(left) ? left : this.evaluate(expr.r, self)
    }

    const l = this.primitive(this.evaluate(expr.l, self)) as never
    const r = this.primitive(this.evaluate(expr.r, self)) as never
    switch (expr.op) {
      case "+":
        return (l as number) + (r as number)
      case "-":
        return l - r
      case "*":
        return l * r
      case "/":
        return l / r
      case "%":
        return l % r
      case "<":
        return l < r
      case ">":
        return l > r
      case "<=":
        return l <= r
      case ">=":
        return l >= r
      case "==":
        return l == r
      case "!=":
        return l != r
      case "===":
        return l === r
      case "!==":
        return l !== r
    }
    throw new PerchanceError("unsupported", expr.op)
  }

  /**
   * Свойства и методы. args === null — обращение без скобок: в perchance
   * `list.selectOne` и `text.titleCase` пишут именно так.
   */
  private member(obj: Value, name: string, args: Value[] | null): Value {
    if (obj === MATH_MARK) return this.math(name, args)

    if (obj instanceof Consumable) {
      if (name === "selectOne" || name === "consumableList") return this.consume(obj)
      if (name === "getLength" || name === "length") return obj.left.length
      return this.member(this.consume(obj), name, args)
    }

    if (isNode(obj) && obj.kind === "list") {
      const list = obj
      const call = <T,>(run: (callArgs: Value[]) => T): T | Fn =>
        args === null ? (...late: Value[]) => run(late) as Value : run(args)

      switch (name) {
        case "selectOne":
          return this.selectOne(list)
        case "selectAll":
          return list.items.map((item) => (item.kind === "item" ? this.renderNode(item) : item))
        case "selectMany":
          return call((callArgs) => Array.from({ length: this.count(callArgs) }, () => this.selectOne(list))) as Value
        case "selectUnique":
          return call((callArgs) => this.selectUnique(list, this.count(callArgs))) as Value
        case "joinItems":
          return call((callArgs) =>
            list.items.map((item) => this.renderNode(item)).join(String(this.primitive(callArgs[0]) ?? "")),
          ) as Value
        case "consumableList":
          return new Consumable(list, [...list.items])
        case "getName":
          return list.name
        case "getLength":
          return list.items.length
        case "evaluateItem":
          return this.renderNode(list)
      }

      const child = list.named.get(name)
      if (child) return child.kind === "prop" ? (this.aliasOf(child) ?? child) : child
    }

    if (isNode(obj) && obj.kind === "prop" && name === "getName") return obj.name

    if (Array.isArray(obj)) {
      switch (name) {
        case "length":
          return obj.length
        case "joinItems":
        case "join": {
          const join = (callArgs: Value[]): string => {
            const separator = callArgs[0] === undefined ? (name === "join" ? "," : "") : this.primitive(callArgs[0])
            return obj.map((item) => this.render(item)).join(String(separator))
          }
          return args === null ? (...late: Value[]) => join(late) : join(args)
        }
        case "selectOne":
          return obj.length ? obj[Math.floor(this.random() * obj.length)] : ""
      }
    }

    if (obj instanceof Missing) throw new PerchanceError("unknownName", obj.name)
    if (obj === undefined || obj === null) throw new PerchanceError("unknownName", name)

    return this.stringMember(this.render(obj), name, args)
  }

  private stringMember(text: string, name: string, args: Value[] | null): Value {
    const plain = (run: (callArgs: Value[]) => Value): Value =>
      args === null ? (...late: Value[]) => run(late) : run(args)
    const arg = (callArgs: Value[], index: number): string => String(this.primitive(callArgs[index]) ?? "")

    switch (name) {
      case "titleCase":
        return titleCase(text)
      case "sentenceCase":
        return sentenceCase(text)
      case "upperCase":
        return text.toUpperCase()
      case "lowerCase":
        return text.toLowerCase()
      case "pluralForm":
        return pluralForm(text)
      case "singularForm":
        return singularForm(text)
      case "evaluateItem":
      case "selectOne":
        return text
      case "length":
        return text.length
      case "toUpperCase":
        return plain(() => text.toUpperCase())
      case "toLowerCase":
        return plain(() => text.toLowerCase())
      case "trim":
        return plain(() => text.trim())
      case "includes":
        return plain((callArgs) => text.includes(arg(callArgs, 0)))
      case "startsWith":
        return plain((callArgs) => text.startsWith(arg(callArgs, 0)))
      case "endsWith":
        return plain((callArgs) => text.endsWith(arg(callArgs, 0)))
      case "indexOf":
        return plain((callArgs) => text.indexOf(arg(callArgs, 0)))
      case "replaceAll":
      case "replace":
        return plain((callArgs) =>
          name === "replace" ? text.replace(arg(callArgs, 0), arg(callArgs, 1)) : text.split(arg(callArgs, 0)).join(arg(callArgs, 1)),
        )
      case "split":
        return plain((callArgs) => text.split(arg(callArgs, 0)))
      case "slice":
      case "substring":
        return plain((callArgs) => {
          const [from, to] = callArgs.map((value) => Number(this.primitive(value)))
          return name === "slice" ? text.slice(from, to) : text.substring(from ?? 0, to)
        })
      case "charAt":
        return plain((callArgs) => text.charAt(Number(this.primitive(callArgs[0]) ?? 0)))
      case "toFixed":
        return plain((callArgs) => Number(text).toFixed(Number(this.primitive(callArgs[0]) ?? 0)))
    }

    throw new PerchanceError("unsupported", `.${name}`)
  }

  private math(name: string, args: Value[] | null): Value {
    const numbers = (args ?? []).map((value) => Number(this.primitive(value)))
    switch (name) {
      case "random":
        return this.random()
      case "floor":
      case "ceil":
      case "round":
      case "abs":
      case "sqrt":
      case "min":
      case "max":
      case "pow":
        return (Math[name] as (...values: number[]) => number)(...numbers)
      case "PI":
        return Math.PI
    }
    throw new PerchanceError("unsupported", `Math.${name}`)
  }
}

const MATH_MARK = Object.freeze(() => undefined) as Fn

export interface Bundle {
  /** Главный генератор: тот, чью ссылку дал игрок. */
  name: string
  sources: Sources
}

/** Что можно кинуть: "" — главный вывод генератора, иначе имя списка верхнего уровня. */
export const listChoices = (bundle: Bundle): string[] => {
  const root = new Runtime(bundle.sources, cryptoRandom).root(bundle.name)
  // В выбор идут только списки, которые можно вывести и назвать: не функции,
  // не наборы одних свойств и не строки вида «output [color]».
  const lists = root.items
    .filter((item): item is ListNode => item.kind === "list" && !item.fn)
    .filter((list) => list.items.length > 0 || list.named.get("$output")?.kind === "prop")
    .map((list) => list.name)
    .filter((name) => IDENT_RE.test(name) && !PAGE_SETTINGS.has(name))

  const main = root.named.get("$output") ?? root.named.get("output")
  const hasMain = main !== undefined && !(main.kind === "list" && main.fn)
  return hasMain ? ["", ...lists.filter((name) => name !== "output" || root.named.has("$output"))] : lists
}

/** Заголовок генератора, если он есть: `title = …` или список title. */
export const generatorTitle = (bundle: Bundle, random: Random = cryptoRandom): string => {
  const runtime = new Runtime(bundle.sources, random)
  const title = runtime.root(bundle.name).named.get("title")
  if (!title) return ""

  try {
    return htmlToText(resolveArticles(runtime.renderNode(title), true)).split("\n")[0] ?? ""
  } catch {
    return ""
  }
}

/** Один бросок по таблице: готовый текст без HTML. */
export const rollList = (bundle: Bundle, list = "", random: Random = cryptoRandom): string => {
  const runtime = new Runtime(bundle.sources, random)
  const root = runtime.root(bundle.name)
  const target = list ? root.named.get(list) : root
  if (!target) throw new PerchanceError("unknownName", list)

  const text = htmlToText(resolveArticles(runtime.renderNode(target), true))
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT - 1)}…` : text
}
