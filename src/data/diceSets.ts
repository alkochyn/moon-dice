/**
 * Наборы быстрых кубов. Парсер формул умеет любое число граней, так что
 * экзотика вроде d7 и d24 работает без отдельной поддержки — здесь только то,
 * что вынесено на кнопки.
 */
export interface DiceSet {
  id: string
  title: string
  /** Расшифровка для подсказки: по «basic» и «DCC» не догадаться. */
  hint: string
  dice: string[]
}

export const DICE_SETS: DiceSet[] = [
  {
    id: "standard",
    title: "basic",
    hint: "Стандартный набор кубов",
    dice: ["d4", "d6", "d8", "d10", "d12", "d20", "d100", "2d6"],
  },
  {
    // Цепочка кубов Dungeon Crawl Classics: там модификаторы двигают бросок
    // по ней вверх-вниз, поэтому нужны все промежуточные грани.
    id: "dcc",
    title: "DCC",
    hint: "Dungeon Crawl Classics",
    dice: ["d2", "d3", "d4", "d5", "d6", "d7", "d8", "d10", "d12", "d14", "d16", "d20", "d24", "d30", "d100"],
  },
]

export const DEFAULT_DICE_SET = "standard"

export const findDiceSet = (id: string): DiceSet => DICE_SETS.find((set) => set.id === id) ?? (DICE_SETS[0] as DiceSet)
