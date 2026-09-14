import type { Die, EvalNode } from "./types"

/** `6!6!2` — цепочка взрывов; `(1)` — отброшенный кубик. */
const formatDie = (die: Die): string => {
  const chain = die.chain.join("!")
  return die.kept ? chain : `(${chain})`
}

export const formatDicePool = (dice: Die[]): string => `[${dice.map(formatDie).join(", ")}]`

/** Разбор броска в виде выражения с подставленными кубами: `[14] + [3] + 6`. */
export const formatDetail = (node: EvalNode): string => {
  const wrap = (text: string): string => (node.paren ? `(${text})` : text)

  switch (node.kind) {
    case "num":
      return wrap(String(node.value))
    case "dice":
      return wrap(formatDicePool(node.dice))
    case "unary":
      return wrap(`-${formatDetail(node.operand)}`)
    case "binary":
      return wrap(`${formatDetail(node.left)} ${node.op} ${formatDetail(node.right)}`)
  }
}

/** Строка для журнала: `1d20+5 → [14] + 5 = 19`. */
export const formatRollLine = (expression: string, detail: string, total: number): string =>
  detail === String(total) ? `${expression} → ${total}` : `${expression} → ${detail} = ${total}`
