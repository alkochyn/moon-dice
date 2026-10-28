import { useRef, useState } from "preact/hooks"

import { newId } from "../board/log"
import { readScoped, writeScoped } from "../board/scope"
import { describePerchanceError, useT } from "../i18n"
import {
  generatorInputs,
  generatorTitle,
  listChoices,
  loadBundle,
  parseGeneratorName,
  PerchanceError,
  rollTable,
  type GeneratorInput,
  type InputValues,
} from "../perchance"
import { HelpIcon, ScrollIcon } from "./icons"

/** Набор таблиц принадлежит доске, как и монстры мастера: у другой партии свои. */
const TABLES_KEY = "dice.tables.v1"

/** В поле генератора вводят модификатор или пару слов, а не простыню: она поехала бы в журнал. */
const MAX_INPUT_LENGTH = 40

/**
 * Таблица в списке: генератор, какой список в нём кидать и что было доступно
 * при загрузке. Поля и введённое в них — у таблиц, добавленных до полей, пусто.
 */
interface TableItem {
  id: string
  generator: string
  title: string
  list: string
  lists: string[]
  inputs: GeneratorInput[]
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
  onRolled: (table: TableRoll, text: string) => void
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

const isItem = (value: unknown): value is Omit<TableItem, "inputs" | "values"> => {
  const item = value as TableItem | null
  return (
    typeof item?.id === "string" &&
    typeof item.generator === "string" &&
    typeof item.title === "string" &&
    typeof item.list === "string" &&
    Array.isArray(item.lists)
  )
}

const readTables = (): TableItem[] => {
  const parsed = readScoped<unknown>(TABLES_KEY, [])
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isItem).map((item) => {
    const stored = item as Partial<TableItem>
    return {
      ...item,
      inputs: Array.isArray(stored.inputs) ? stored.inputs.filter(isInput) : [],
      values: readInputValues(stored.values),
    }
  })
}

/** В бросок идут все объявленные поля, даже пустые: на странице perchance они тоже всегда есть. */
const valuesFor = (item: TableItem): InputValues =>
  Object.fromEntries(item.inputs.map((input) => [input.name, item.values[input.name] ?? ""]))

/**
 * Вкладка таблиц: игрок вставляет ссылку на генератор perchance, панель
 * забирает код его списков и дальше кидает по нему сама. Страница
 * генератора с её оформлением сюда не едет — только текст результата.
 */
export const Tables = ({ onRolled }: Props) => {
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
    setItems(next)
    writeScoped(TABLES_KEY, next)
  }

  const describe = (failure: unknown): string =>
    failure instanceof PerchanceError ? describePerchanceError(t, failure) : t.perchanceErrors.network("")

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
      save([...itemsRef.current, item])
      setDraft("")
      setError(null)
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(null)
    }
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
              onClick={() => save(itemsRef.current.filter((other) => other.id !== item.id))}
              aria-label={t.tables.remove(item.title)}
              title={t.tables.remove(item.title)}
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
