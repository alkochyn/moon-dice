import { parseFormula } from "../../dice"
import type { Node } from "../../dice/types"

/**
 * ASCII-графика скина «Терминал». Всё здесь — чистые функции над строками:
 * их легко проверить тестами, а компонент только раскладывает готовый текст
 * по <pre>.
 */

/** Один куб из записи журнала в том виде, в каком его нужно нарисовать. */
export interface AsciiDie {
  sides: number
  value: number
  /** Отброшенный кубик (kh/kl, преимущество) рисуется приглушённо. */
  kept: boolean
  exploded: boolean
  /** -1 — куб вычитается: `10-1d6`. */
  sign: 1 | -1
}

/**
 * Бросок для рисунка: кубы со знаками и все постоянные слагаемые одним
 * числом. `1d20+1+1d4+5` — это [d20] + [d4] + 6.
 */
export interface RollArt {
  dice: AsciiDie[]
  modifier: number
  /**
   * Только сложение и вычитание. В `(1d6+2)*2` кубы и модификатор в ряд
   * через плюсы нарисовать нельзя — это была бы неправда, там нужен текст.
   */
  linear: boolean
}

interface Pool {
  sides: number
  sign: 1 | -1
}

/** Обходит дерево слева направо — в том же порядке, что и строка разбора. */
const walk = (node: Node, sign: 1 | -1, out: { pools: Pool[]; modifier: number; linear: boolean }): void => {
  switch (node.kind) {
    case "num":
      out.modifier += sign * node.value
      return
    case "dice":
      out.pools.push({ sides: node.sides, sign })
      return
    case "unary":
      walk(node.operand, sign === 1 ? -1 : 1, out)
      return
    case "binary":
      if (node.op === "*" || node.op === "/") out.linear = false
      walk(node.left, sign, out)
      walk(node.right, node.op === "-" ? (sign === 1 ? -1 : 1) : sign, out)
      return
  }
}

/**
 * Кубы восстанавливаются из того, что уже лежит в журнале: формулы и строки
 * разбора `[14, (3)] + 5`. Своих полей в запись не добавляем — журнал общий,
 * и у части партии может работать старая панель. Пулы в разборе идут в том же
 * порядке, что и кубы в дереве формулы (слева направо), так что грани берём
 * оттуда. Если что-то не сошлось — null, и скин покажет разбор текстом.
 */
export const rollArtOf = (expression: string, detail: string): RollArt | null => {
  const tree = { pools: [] as Pool[], modifier: 0, linear: true }
  try {
    walk(parseFormula(expression).ast, 1, tree)
  } catch {
    return null
  }

  const pools = [...detail.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1] ?? "")
  if (pools.length !== tree.pools.length) return null

  const dice: AsciiDie[] = []
  for (const [index, pool] of pools.entries()) {
    const { sides, sign } = tree.pools[index] as Pool
    for (const raw of pool.split(",")) {
      const text = raw.trim()
      const chain = text.replace(/[()]/g, "").split("!").map(Number)
      if (!text || chain.some((n) => !Number.isFinite(n))) return null
      dice.push({
        sides,
        value: chain.reduce((sum, n) => sum + n, 0),
        kept: !text.startsWith("("),
        exploded: chain.length > 1,
        sign,
      })
    }
  }

  return { dice, modifier: tree.modifier, linear: tree.linear }
}

export type ArtItem = { kind: "op"; sign: "+" | "-" } | { kind: "die"; index: number } | { kind: "mod"; value: number }

/**
 * Порядок картинки: кубы как в формуле, модификатор в конце — `[d20] + [d4]
 * + 6`. Минус перед первым кубом выглядит как обрывок, поэтому, если первый
 * куб вычитается, а модификатор положительный, модификатор встаёт вперёд:
 * `4-1d20+4+1d5+2` — это `10 - [d20] + [d5]`. Знак у самого куба при этом не
 * теряется: без него картинка врала бы.
 */
export const artLayout = (art: RollArt): ArtItem[] => {
  const items: ArtItem[] = []
  const leadingMinus = art.dice[0]?.sign === -1
  const modFirst = leadingMinus && art.modifier > 0
  const push = (sign: 1 | -1, item: ArtItem): void => {
    if (items.length > 0 || sign < 0) items.push({ kind: "op", sign: sign < 0 ? "-" : "+" })
    items.push(item)
  }

  if (modFirst) push(1, { kind: "mod", value: art.modifier })
  art.dice.forEach((die, index) => push(die.sign, { kind: "die", index }))
  if (!modFirst && art.modifier !== 0) {
    push(art.modifier < 0 ? -1 : 1, { kind: "mod", value: Math.abs(art.modifier) })
  }

  return items
}

/** Только кубы — для натуральных 20 и 1, им знаки и модификатор не важны. */
export const diceOf = (expression: string, detail: string): AsciiDie[] | null =>
  rollArtOf(expression, detail)?.dice ?? null

export type Natural = "crit" | "fumble" | null

/**
 * Натуральные 20 и 1 считаются по единственному засчитанному d20: так
 * работают и `1d20+5`, и `d20adv` (второй куб отброшен). В формуле с
 * несколькими d20 «натуральной» нет — непонятно, какой из них считать.
 */
export const naturalOf = (dice: AsciiDie[] | null): Natural => {
  const d20 = (dice ?? []).filter((die) => die.sides === 20 && die.kept)
  if (d20.length !== 1) return null

  const die = d20[0] as AsciiDie
  if (die.exploded) return "crit"
  if (die.value === 20) return "crit"
  if (die.value === 1) return "fumble"
  return null
}

const PIPS: Record<number, [string, string, string]> = {
  1: ["     ", "  o  ", "     "],
  2: ["o    ", "     ", "    o"],
  3: ["o    ", "  o  ", "    o"],
  4: ["o   o", "     ", "o   o"],
  5: ["o   o", "  o  ", "o   o"],
  6: ["o   o", "o   o", "o   o"],
}

/**
 * Куб в рамке 7×5: грани подписаны на верхней кромке, у d6 вместо числа
 * точки. Для длинных чисел (взорвавшиеся кубы) рамка расширяется.
 *
 * bare — одна рамка, без подписи и числа: в моноширинной сетке «d4» и «17»
 * в пяти позициях по центру не встают, поэтому скин кладёт их поверх рамки
 * и центрирует уже вёрсткой.
 */
export const dieArt = (die: AsciiDie, bare = false): string => {
  const value = String(die.value)
  const inner = Math.max(5, value.length + 2)
  const label = bare ? "" : `-d${die.sides}`
  const top = `.${(label + "-".repeat(inner)).slice(0, inner)}.`
  const bottom = `'${"-".repeat(inner)}'`

  const pips = hasPips(die) ? PIPS[die.value] : undefined
  const blank = " ".repeat(inner)
  const middle = pips
    ? pips
    : (() => {
        const left = Math.floor((inner - value.length) / 2)
        return [blank, bare ? blank : (" ".repeat(left) + value + blank).slice(0, inner), blank]
      })()

  return [top, ...middle.map((row) => `|${row}|`), bottom].join("\n")
}

/** У d6 вместо числа точки — если он не взорвался в двузначное. */
export const hasPips = (die: AsciiDie): boolean => die.sides === 6 && !die.exploded && die.value >= 1 && die.value <= 6

/** Цифры для суммы: три строки на знак, как на семисегментном табло. */
const DIGITS: Record<string, [string, string, string]> = {
  "0": [" _ ", "| |", "|_|"],
  "1": ["   ", "  |", "  |"],
  "2": [" _ ", " _|", "|_ "],
  "3": [" _ ", " _|", " _|"],
  "4": ["   ", "|_|", "  |"],
  "5": [" _ ", "|_ ", " _|"],
  "6": [" _ ", "|_ ", "|_|"],
  "7": [" _ ", "  |", "  |"],
  "8": [" _ ", "|_|", "|_|"],
  "9": [" _ ", "|_|", " _|"],
  "-": ["   ", " _ ", "   "],
}

export const bigNumber = (value: number): string => {
  const chars = String(value).split("")
  return [0, 1, 2].map((row) => chars.map((char) => DIGITS[char]?.[row] ?? "   ").join(" ")).join("\n")
}

/** Меч на натуральной 20. Он же кнопка: клик зажигает огонь ещё раз. */
export const SWORD = ["    /", "O===[====================-", "    \\"].join("\n")

/** Череп на натуральной 1; в «клацающем» кадре другие глаза и зубы. */
export const skullArt = (chatter: boolean): string => {
  const eyes = chatter ? "@@ @@" : "() ()"
  // Ровно 7×5, как рамка куба: череп ложится поверх d20 и закрывает его целиком.
  return [" _____ ", "/     \\", `|${eyes}|`, " \\ ^ / ", chatter ? " |'|'| " : " ||||| "].join("\n")
}

/**
 * Огонь из символов: классика демо-сцены. Снизу подкидываем жар, каждая
 * клетка усредняет соседей снизу и остывает; сверху летят искры. rng
 * подменяется в тестах.
 */
export class AsciiFire {
  private heat: Float32Array
  private sparks: Array<{ x: number; y: number }> = []

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly rng: () => number = Math.random,
  ) {
    this.heat = new Float32Array(width * (height + 2))
  }

  /** Сброс и несколько тактов вхолостую, чтобы пламя появилось сразу. */
  reset(): void {
    this.heat.fill(0)
    this.sparks = []
    for (let i = 0; i < 6; i++) this.step(false)
  }

  /** fading — догорание: жар снизу почти не подкидывается, огонь опадает. */
  step(fading: boolean): void {
    const { width, height, heat, rng } = this
    const seed = fading ? 0.08 : 1
    const decay = fading ? 0.16 : 0.075
    const at = (x: number, y: number): number => heat[y * width + Math.max(0, Math.min(width - 1, x))] ?? 0

    for (let y = height; y < height + 2; y++) {
      for (let x = 0; x < width; x++) {
        heat[y * width + x] = rng() < 0.6 ? seed * (0.6 + rng() * 0.4) : seed * rng() * 0.5
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const drift = x + Math.floor(rng() * 3) - 1
        const sum = at(drift - 1, y + 1) + at(drift, y + 1) + at(drift + 1, y + 1) + at(x, y + 2)
        heat[y * width + x] = Math.max(0, sum / 4 - decay * rng() * 1.6)
      }
    }

    if (!fading && rng() < 0.8) {
      this.sparks.push({ x: Math.floor(rng() * width), y: height - 4 - Math.floor(rng() * 4) })
    }
    this.sparks = this.sparks
      .map((spark) => ({ x: spark.x + Math.floor(rng() * 3) - 1, y: spark.y - 1 }))
      .filter((spark) => spark.y >= 0 && spark.x >= 0 && spark.x < width)
  }

  /** Строки сверху вниз; level 0–5 — насколько горяча строка, для цвета. */
  rows(): Array<{ text: string; level: number }> {
    const ramp = " .,-~:;=!*#$@"
    const rows: Array<{ text: string; level: number }> = []

    for (let y = 0; y < this.height; y++) {
      const chars: string[] = []
      let total = 0
      for (let x = 0; x < this.width; x++) {
        const value = this.heat[y * this.width + x] ?? 0
        total += value
        chars.push(ramp[Math.min(ramp.length - 1, Math.floor(value * ramp.length))] as string)
      }
      for (const spark of this.sparks) {
        if (spark.y === y) chars[spark.x] = this.rng() < 0.5 ? "*" : "."
      }
      rows.push({ text: chars.join(""), level: Math.min(5, Math.floor((total / this.width) * 6 * 1.3)) })
    }

    return rows
  }
}
