import { cryptoRng, parseFormula, rollFormula, type EvalNode, type Rng } from "../dice"

/**
 * Участник броска инициативы. Игрок приходит со своей формулой из настроек,
 * монстр — из списка мастера; внешность нужна, чтобы в журнале строка игрока
 * была узнаваема с первого взгляда.
 */
export interface Combatant {
  name: string
  formula: string
  npc: boolean
  userId?: string
  icon?: string
  color?: string
}

export interface InitiativeResult {
  name: string
  expression: string
  total: number
  detail: string
  npc: boolean
  userId?: string
  icon?: string
  color?: string
}

/** Формула по умолчанию — для игрока, который свою ещё не вписал. */
export const DEFAULT_INITIATIVE = "1d20"

/**
 * Сумма выпавшего на кубах с учётом знаков. Всё, что сверх неё, — модификатор:
 * у `1d20+2` это 2. Умножение и деление здесь приближение, но формул
 * инициативы с ними за столом не бывает.
 */
const diceSum = (node: EvalNode, sign = 1): number => {
  switch (node.kind) {
    case "num":
      return 0
    case "dice":
      return sign * node.value
    case "unary":
      return diceSum(node.operand, -sign)
    case "binary":
      if (node.op === "+") return diceSum(node.left, sign) + diceSum(node.right, sign)
      if (node.op === "-") return diceSum(node.left, sign) - diceSum(node.right, sign)
      return 0
  }
}

/**
 * Строка монстра в синтаксисе обычной формулы: `1d20+1 : Гоблины` — один
 * бросок на группу, `3#1d20+1 : Гоблин` — три гоблина, каждому свой бросок,
 * они получают номера. Повторитель и метка уже есть в движке, так что мастеру
 * не нужно учить ничего нового.
 */
export const expandMonster = (source: string, fallbackName: string): Combatant[] => {
  const parsed = parseFormula(source)
  const name = parsed.label?.trim() || fallbackName

  if (parsed.repeat === 1) return [{ name, formula: parsed.expression, npc: true }]

  // В expression повторитель остаётся как написан — `3#1d20+1`, каждому
  // гоблину нужна формула без него.
  const formula = parsed.expression.slice(parsed.expression.indexOf("#") + 1).trim()

  return Array.from({ length: parsed.repeat }, (_, index) => ({
    name: `${name} ${index + 1}`,
    formula,
    npc: true,
  }))
}

/**
 * Кидает инициативу за всех и выстраивает порядок: больше — раньше. Ничьи
 * решаются так, как договорились за столом: игрок ходит раньше монстра, дальше
 * больший модификатор, а если и он равен — жребий. Жребий кидается тем же
 * честным генератором, что и кубы, и только для ничьих.
 *
 * Бросает DiceError, если чья-то формула не разбирается, — панель покажет,
 * чья именно, ещё до броска, так что сюда доходят только проверенные.
 */
export const rollInitiative = (combatants: Combatant[], rng: Rng = cryptoRng): InitiativeResult[] => {
  const rolled = combatants.map((combatant) => {
    const result = rollFormula(combatant.formula, rng)
    const single = result.rolls[0]
    if (!single) throw new Error("rollFormula вернул пустой бросок")

    return {
      combatant,
      expression: result.expression,
      total: single.total,
      detail: single.detail,
      modifier: single.total - diceSum(single.tree),
      lot: 0,
    }
  })

  const key = (item: (typeof rolled)[number]): string =>
    `${item.total}|${item.combatant.npc ? 0 : 1}|${item.modifier}`
  const counts = new Map<string, number>()
  for (const item of rolled) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  for (const item of rolled) if ((counts.get(key(item)) ?? 0) > 1) item.lot = rng(1_000_000)

  rolled.sort(
    (a, b) =>
      b.total - a.total ||
      Number(a.combatant.npc) - Number(b.combatant.npc) ||
      b.modifier - a.modifier ||
      b.lot - a.lot,
  )

  return rolled.map(({ combatant, expression, total, detail }) => ({
    name: combatant.name,
    expression,
    total,
    detail,
    npc: combatant.npc,
    ...(combatant.userId ? { userId: combatant.userId } : {}),
    ...(combatant.icon ? { icon: combatant.icon } : {}),
    ...(combatant.color ? { color: combatant.color } : {}),
  }))
}
