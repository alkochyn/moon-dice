import { readKey, subscribeKey, updateKey } from "./storage"
import type { GeneratorInput, InputValues } from "../perchance"

/**
 * Таблицы perchance — общие для партии: мастер подключил генератор, и он
 * есть у всех на этой доске. Список живёт в хранилище доски, а что игрок
 * выбрал в таблице (список, введённое в поля) — его личное и остаётся в его
 * браузере: у бойца своя кость промаха и своя удача.
 */
const SHARED_KEY = "tables.shared"

/** Таблица, как её видит вся партия: генератор и что в нём нашлось при подключении. */
export interface SharedTable {
  id: string
  generator: string
  title: string
  lists: string[]
  inputs: GeneratorInput[]
}

interface TableBox {
  updatedAt: number
  items: SharedTable[]
}

/** Введённое в поля — из хранилища или чужой записи журнала: берём только строки. */
export const readInputValues = (value: unknown): InputValues =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    : {}

const isInput = (value: unknown): value is GeneratorInput => {
  const input = value as GeneratorInput | null
  return typeof input?.name === "string" && typeof input.label === "string"
}

/** Таблица из хранилища доски или старой локальной копии; без полей — таблица до полей. */
export const readSharedTable = (value: unknown): SharedTable | null => {
  const item = value as Partial<SharedTable> | null
  if (
    typeof item?.id !== "string" ||
    typeof item.generator !== "string" ||
    typeof item.title !== "string" ||
    !Array.isArray(item.lists)
  ) {
    return null
  }

  return {
    id: item.id,
    generator: item.generator,
    title: item.title,
    lists: item.lists.filter((list): list is string => typeof list === "string"),
    inputs: Array.isArray(item.inputs) ? item.inputs.filter(isInput) : [],
  }
}

const sanitize = (items: unknown): SharedTable[] =>
  Array.isArray(items) ? items.map(readSharedTable).filter((item): item is SharedTable => item !== null) : []

/** undefined — доска не ответила или таблиц там ещё не было: это не «таблиц нет». */
const fromBox = (box: TableBox | undefined): SharedTable[] | undefined =>
  box && Array.isArray(box.items) ? sanitize(box.items) : undefined

export const readSharedTables = async (): Promise<SharedTable[] | undefined> =>
  fromBox(await readKey<TableBox>(SHARED_KEY))

/**
 * Правка общего списка поверх того, что сейчас на доске, а не поверх своей
 * копии: два игрока, подключившие по генератору одновременно, не затирают
 * друг друга. null — доска не приняла запись.
 */
export const updateSharedTables = async (
  mutate: (items: SharedTable[]) => SharedTable[],
): Promise<SharedTable[] | null> => {
  const box = await updateKey<TableBox>(SHARED_KEY, (current) => ({
    updatedAt: Date.now(),
    items: mutate(fromBox(current) ?? []),
  }))
  return box ? box.items : null
}

/** Свои таблицы, которых на доске нет, — в конец общего списка, без дублей по id. */
export const mergeTables = (board: SharedTable[], local: SharedTable[]): SharedTable[] => {
  const known = new Set(board.map((item) => item.id))
  return [...board, ...local.filter((item) => !known.has(item.id))]
}

export const subscribeSharedTables = (handler: (items: SharedTable[]) => void): (() => void) =>
  subscribeKey<TableBox>(SHARED_KEY, (box) => {
    const items = fromBox(box)
    if (items) handler(items)
  })
