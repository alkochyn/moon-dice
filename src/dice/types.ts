/**
 * Что именно не так с формулой. Движок кубов не знает про языки интерфейса:
 * он отдаёт код и подробности, а текст для игрока собирает словарь в src/i18n.
 */
export type DiceErrorCode =
  | "empty"
  | "divisionByZero"
  | "expectedSides"
  | "expectedKeepCount"
  | "unclosedParen"
  | "unexpectedEnd"
  | "unexpectedToken"
  | "needSides"
  | "countRange"
  | "sidesRange"
  | "explodeD1"
  | "keepRange"
  | "singleDieOnly"
  | "unknownModifier"
  | "tooManyDice"
  | "repeatRange"
  | "trailing"
  | "unknownChar"

/** Подробности для текста ошибки: число из лимита или кусок формулы. */
export type DiceErrorParams = { value?: string; max?: number }

/** Ошибка разбора формулы: всегда с позицией, чтобы подсветить место в инпуте. */
export class DiceError extends Error {
  constructor(
    readonly code: DiceErrorCode,
    readonly params: DiceErrorParams = {},
    readonly pos: number = 0,
  ) {
    super(params.value ? `${code}: ${params.value}` : code)
    this.name = "DiceError"
  }
}

export type KeepMode = "h" | "l"

export type Node =
  | { kind: "num"; value: number; paren: boolean }
  | {
      kind: "dice"
      count: number
      sides: number
      keep?: { mode: KeepMode; n: number }
      explode: boolean
      paren: boolean
    }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node; paren: boolean }
  | { kind: "unary"; operand: Node; paren: boolean }

export interface ParsedFormula {
  /** Формула без метки; повторитель остаётся как написан: `3#1d20`. */
  expression: string
  /** Сколько раз кинуть формулу: `3#1d20` -> 3. */
  repeat: number
  /** Комментарий после двоеточия: `1d20+5 : атака`. */
  label?: string
  ast: Node
}

/** Один куб после броска. `chain` длиннее одного элемента у взрывных кубов. */
export interface Die {
  chain: number[]
  value: number
  kept: boolean
}

export type EvalNode =
  | { kind: "num"; value: number; paren: boolean }
  | { kind: "dice"; value: number; dice: Die[]; paren: boolean }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: EvalNode; right: EvalNode; value: number; paren: boolean }
  | { kind: "unary"; operand: EvalNode; value: number; paren: boolean }

export interface SingleRoll {
  total: number
  /** Разбор броска: `[14] + [3] + 6`. */
  detail: string
  tree: EvalNode
}

export interface RollResult {
  /** Исходная строка, как её ввёл игрок. */
  source: string
  expression: string
  label?: string
  rolls: SingleRoll[]
  /** Сумма по всем повторам — полезна только при repeat === 1. */
  total: number
}
