import { useEffect, useRef, useState } from "preact/hooks"

import { newId } from "../board/log"
import { readScoped, writeScoped } from "../board/scope"
import {
  mergeTables,
  readInputValues,
  readSharedTable,
  readSharedTables,
  subscribeSharedTables,
  updateSharedTables,
  type SharedTable,
} from "../board/tables"
import { describePerchanceError, useT } from "../i18n"
import {
  generatorInputs,
  generatorTitle,
  listChoices,
  loadBundle,
  parseGeneratorName,
  PerchanceError,
  rollTable,
  type InputValues,
} from "../perchance"
import { HelpIcon, ScrollIcon } from "./icons"

/**
 * Копия таблиц этой доски у игрока: список — как на доске, плюс что игрок
 * выбрал в каждой таблице. Без доски (локальный режим) это и есть список.
 */
const TABLES_KEY = "dice.tables.v1"
/** Свои таблицы уже отданы доске: дальше список ведёт доска, а копия его повторяет. */
const SYNCED_KEY = "dice.tables.synced.v1"
/** Как и журнал, общий список не держится на одной подписке: onValue на живой доске доезжает не всегда. */
const POLL_INTERVAL_MS = 4000

/** В поле генератора вводят модификатор или пару слов, а не простыню: она поехала бы в журнал. */
const MAX_INPUT_LENGTH = 40

/** Таблица в списке: общая часть с доски и личный выбор — какой список кидать и что введено в поля. */
interface TableItem extends SharedTable {
  list: string
  values: InputValues
}

/** Что уходит в журнал: из какой таблицы бросок и как его перебросить. */
export interface TableRoll {
  generator: string
  list: string
  title: string
  inputs: InputValues
}

interface Props {
  /** Доска на связи и пространство поднято: список таблиц общий для партии. */
  connected: boolean
  onRolled: (table: TableRoll, text: string) => void
}

const readTables = (): TableItem[] => {
  const parsed = readScoped<unknown>(TABLES_KEY, [])
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((value) => {
    const table = readSharedTable(value)
    if (!table) return []
    const stored = value as Partial<TableItem>
    const list = typeof stored.list === "string" ? stored.list : (table.lists[0] ?? "")
    return [{ ...table, list, values: readInputValues(stored.values) }]
  })
}

const toShared = ({ id, generator, title, lists, inputs }: TableItem): SharedTable => ({
  id,
  generator,
  title,
  lists,
  inputs,
})

/** Список и порядок — с доски, а выбор в каждой таблице — из своей копии. */
const withChoices = (board: SharedTable[], local: TableItem[]): TableItem[] =>
  board.map((table) => {
    const mine = local.find((item) => item.id === table.id)
    const list = mine && table.lists.includes(mine.list) ? mine.list : (table.lists[0] ?? "")
    return { ...table, list, values: mine?.values ?? {} }
  })

/** В бросок идут все объявленные поля, даже пустые: на странице perchance они тоже всегда есть. */
const valuesFor = (item: TableItem): InputValues =>
  Object.fromEntries(item.inputs.map((input) => [input.name, item.values[input.name] ?? ""]))

/**
 * Вкладка таблиц: игрок вставляет ссылку на генератор perchance, панель
 * забирает код его списков и дальше кидает по нему сама. Страница
 * генератора с её оформлением сюда не едет — только текст результата.
 * Подключённый генератор появляется у всей партии на этой доске.
 */
export const Tables = ({ connected, onRolled }: Props) => {
  const t = useT()
  const [items, setItems] = useState<TableItem[]>(readTables)
  const [draft, setDraft] = useState("")
  /** "add" — грузим новую таблицу, иначе id таблицы, по которой кидаем. */
  const [busy, setBusy] = useState<string | null>(null)
  const [hintOpen, setHintOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Загрузка асинхронная: пока она шла, список могли поправить.
  const itemsRef = useRef(items)
  itemsRef.current = items

  const save = (next: TableItem[]): void => {
    // Опрос доски приносит тот же список раз в несколько секунд — перерисовывать незачем.
    if (JSON.stringify(next) === JSON.stringify(itemsRef.current)) return
    itemsRef.current = next
    setItems(next)
    writeScoped(TABLES_KEY, next)
  }

  useEffect(() => {
    if (!connected) return undefined
    let alive = true
    let stop = (): void => {}
    let poll: ReturnType<typeof setInterval> | undefined
    const apply = (board: SharedTable[]): void => {
      if (alive) save(withChoices(board, itemsRef.current))
    }

    void (async () => {
      // Таблицы, подключённые до общего списка, были только у того, кто их
      // подключил. Отдаём их доске один раз: потом копия лишь повторяет доску,
      // иначе убранная партией таблица воскресала бы из чьей-то старой копии.
      if (!readScoped<boolean>(SYNCED_KEY, false)) {
        const local = itemsRef.current.map(toShared)
        if (local.length > 0 && (await updateSharedTables((board) => mergeTables(board, local))) === null) return
        writeScoped(SYNCED_KEY, true)
      }
      if (!alive) return

      const board = await readSharedTables()
      if (board) apply(board)
      if (!alive) return

      stop = subscribeSharedTables(apply)
      poll = setInterval(() => {
        if (document.hidden) return
        void readSharedTables().then((next) => next && apply(next))
      }, POLL_INTERVAL_MS)
    })()

    return () => {
      alive = false
      stop()
      clearInterval(poll)
    }
  }, [connected])

  const describe = (failure: unknown): string =>
    failure instanceof PerchanceError ? describePerchanceError(t, failure) : t.perchanceErrors.network("")

  /** Правка общего списка: на доске, если она на связи, иначе — только у себя. */
  const changeList = async (
    change: (tables: SharedTable[]) => SharedTable[],
    local: TableItem[],
  ): Promise<boolean> => {
    if (!connected) {
      save(local)
      return true
    }

    const board = await updateSharedTables(change)
    if (!board) {
      setError(t.tables.shareFailed)
      return false
    }
    save(withChoices(board, local))
    return true
  }

  const add = async (): Promise<void> => {
    if (busy) return
    const name = parseGeneratorName(draft)
    if (!name) {
      setError(describePerchanceError(t, new PerchanceError("badLink")))
      return
    }

    setBusy("add")
    try {
      // Добавляют, чтобы кинуть свежую версию, — кэш здесь не в счёт.
      const bundle = await loadBundle(name, { force: true })
      const lists = listChoices(bundle)
      const item: TableItem = {
        id: newId(),
        generator: name,
        title: generatorTitle(bundle) || name,
        list: lists[0] ?? "",
        lists,
        inputs: generatorInputs(bundle),
        values: {},
      }
      if (await changeList((tables) => [...tables, toShared(item)], [...itemsRef.current, item])) {
        setDraft("")
        setError(null)
      }
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(null)
    }
  }

  const remove = (id: string): void => {
    void changeList(
      (tables) => tables.filter((table) => table.id !== id),
      itemsRef.current.filter((item) => item.id !== id),
    )
  }

  const roll = async (item: TableItem): Promise<void> => {
    if (busy) return
    setBusy(item.id)
    try {
      const inputs = valuesFor(item)
      const text = await rollTable(item.generator, item.list, inputs)
      setError(null)
      onRolled({ generator: item.generator, list: item.list, title: item.title, inputs }, text)
    } catch (failure) {
      setError(t.errors.presetPrefix(item.title, describe(failure)))
    } finally {
      setBusy(null)
    }
  }

  const listLabel = (list: string): string => list || t.tables.main

  /** Выбор в таблице личный: на доску не уходит. */
  const update = (id: string, change: (item: TableItem) => TableItem): void =>
    save(itemsRef.current.map((other) => (other.id === id ? change(other) : other)))

  return (
    <div className="combat tables">
      <div className="combat__list">
        {items.length === 0 && <p className="combat__hint">{t.tables.empty}</p>}

        {items.map((item) => (
          <div key={item.id} className="combat__row tables__row">
            <button
              className="tables__roll"
              disabled={busy !== null}
              onClick={() => void roll(item)}
              aria-label={t.tables.roll(item.title)}
              title={item.generator}
            >
              <ScrollIcon />
              <span className="tables__title">{item.title}</span>
            </button>

            {/* Подпись поля — в подсказке внутри него: с подписью рядом даже
                одно поле не влезало в строку с названием и списком. */}
            {item.inputs.map((input) => (
              <input
                key={input.name}
                className="input input--compact tables__input"
                type="text"
                autocomplete="off"
                spellcheck={false}
                maxLength={MAX_INPUT_LENGTH}
                placeholder={input.label}
                aria-label={input.label}
                title={input.label}
                value={item.values[input.name] ?? ""}
                onInput={(event) => {
                  const value = (event.target as HTMLInputElement).value
                  update(item.id, (other) => ({ ...other, values: { ...other.values, [input.name]: value } }))
                }}
                onKeyDown={(event) => event.key === "Enter" && void roll(item)}
              />
            ))}

            {item.lists.length > 1 && (
              <select
                className="tables__list"
                value={item.list}
                aria-label={t.tables.listFor(item.title)}
                onChange={(event) => {
                  const list = (event.target as HTMLSelectElement).value
                  update(item.id, (other) => ({ ...other, list }))
                }}
              >
                {item.lists.map((list) => (
                  <option key={list} value={list}>
                    {listLabel(list)}
                  </option>
                ))}
              </select>
            )}

            <button
              className="btn btn--ghost btn--icon"
              onClick={() => remove(item.id)}
              aria-label={connected ? t.tables.removeShared(item.title) : t.tables.remove(item.title)}
              title={connected ? t.tables.removeShared(item.title) : t.tables.remove(item.title)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="combat__footer">
        <div className="combat__add">
          <input
            className="input input--compact"
            type="text"
            autocomplete="off"
            spellcheck={false}
            placeholder={t.tables.placeholder}
            aria-label={t.tables.placeholder}
            value={draft}
            onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => event.key === "Enter" && void add()}
          />
          <button className="btn btn--compact" onClick={() => void add()} disabled={busy === "add"}>
            {busy === "add" ? t.tables.adding : t.tables.add}
          </button>
          <button
            className="btn btn--ghost btn--icon combat__help"
            onClick={() => setHintOpen((open) => !open)}
            aria-expanded={hintOpen}
            aria-label={t.tables.help}
            title={t.tables.help}
          >
            <HelpIcon />
          </button>
        </div>
        {hintOpen && <p className="combat__hint">{t.tables.hint}</p>}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}
