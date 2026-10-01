import { parseFormula } from "./parse"
import { evaluate } from "./evaluate"
import { formatDetail } from "./format"
import { cryptoRng, type Rng } from "./random"
import { DiceError, type RollResult, type SingleRoll } from "./types"

export { DiceError } from "./types"
export type { RollResult, SingleRoll, Die, EvalNode, DiceErrorCode, DiceErrorParams } from "./types"
export { parseFormula, LIMITS } from "./parse"
export { formatDetail, formatDicePool, formatRollLine } from "./format"
export { cryptoRng } from "./random"
export type { Rng } from "./random"

/** Бросает формулу. Кидает DiceError, если формулу не удалось разобрать. */
export const rollFormula = (source: string, rng: Rng = cryptoRng): RollResult => {
  const parsed = parseFormula(source)
  const rolls: SingleRoll[] = []

  for (let i = 0; i < parsed.repeat; i++) {
    const tree = evaluate(parsed.ast, rng)
    rolls.push({ total: tree.value, detail: formatDetail(tree), tree })
  }

  return {
    source,
    expression: parsed.expression,
    ...(parsed.label ? { label: parsed.label } : {}),
    rolls,
    total: rolls.reduce((sum, roll) => sum + roll.total, 0),
  }
}

/** Проверка формулы без броска — для подсветки инпута на лету. */
export const validateFormula = (source: string): { ok: true } | { ok: false; error: DiceError } => {
  try {
    parseFormula(source)
    return { ok: true }
  } catch (error) {
    if (error instanceof DiceError) return { ok: false, error }
    throw error
  }
}
