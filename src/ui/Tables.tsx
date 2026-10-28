import { useRef, useState } from "preact/hooks"

import { newId } from "../board/log"
import { readScoped, writeScoped } from "../board/scope"
import { describePerchanceError, useT } from "../i18n"
import {
  generatorTitle,
  listChoices,
  loadBundle,
  parseGeneratorName,
  PerchanceError,
  rollTable,
} from "../perchance"
import { HelpIcon, ScrollIcon } from "./icons"

/** Набор таблиц принадлежит доске, как и монстры мастера: у другой партии свои. */
const TABLES_KEY = "dice.tables.v1"

/** Таблица в списке: генератор, какой список в нём кидать и что было доступно при загрузке. */
interface TableItem {
  id: string
  generator: string
  title: string
  list: string
  lists: string[]
}

/** Что уходит в журнал: из какой таблицы бросок и как его перебросить. */
export interface TableRoll {
  generator: string
  list: string
  title: string
}

interface Props {
  onRolled: (table: TableRoll, text: string) => void
}

const isItem = (value: unknown): value is TableItem => {
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
  return Array.isArray(parsed) ? parsed.filter(isItem) : []
}

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
      const text = await rollTable(item.generator, item.list)
      setError(null)
      onRolled({ generator: item.generator, list: item.list, title: item.title }, text)
    } catch (failure) {
      setError(t.errors.presetPrefix(item.title, describe(failure)))
    } finally {
      setBusy(null)
    }
  }

  const listLabel = (list: string): string => list || t.tables.main

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

            {item.lists.length > 1 && (
              <select
                className="tables__list"
                value={item.list}
                aria-label={t.tables.listFor(item.title)}
                onChange={(event) => {
                  const list = (event.target as HTMLSelectElement).value
                  save(itemsRef.current.map((other) => (other.id === item.id ? { ...other, list } : other)))
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
