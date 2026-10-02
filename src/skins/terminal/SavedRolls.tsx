import { useEffect, useState } from "preact/hooks"

import { makePreset, reorderPresets, type Preset } from "../../board/presets"
import { parseFormula } from "../../dice"
import { useT } from "../../i18n"

interface Props {
  title: string
  hint?: string
  items: Preset[]
  /** Подписи горячих клавиш для первых строк; у общих бросков их нет. */
  keys: string[]
  /** Что сейчас набрано в поле ввода — его можно сохранить в список. */
  field: string
  onChange: (items: Preset[]) => void
  onRoll: (preset: Preset) => void
  onFieldUsed: () => void
}

/**
 * Список сохранённых бросков с правкой на месте. Порядок важен: первые
 * строки висят на F-клавишах, поэтому вместо перетаскивания — стрелки,
 * они же работают с клавиатуры.
 */
export const SavedRolls = ({ title, hint, items, keys, field, onChange, onRoll, onFieldUsed }: Props) => {
  const t = useT()
  const [error, setError] = useState<string | null>(null)

  const saveField = (): void => {
    let parsed
    try {
      parsed = parseFormula(field.trim())
    } catch {
      setError(t.term.fieldEmpty)
      return
    }
    setError(null)
    onChange([...items, makePreset(parsed.label ?? "", parsed.expression)])
    onFieldUsed()
  }

  return (
    <section className="term-saved">
      <div className="term-saved__head">
        <span className="term-saved__title">{title}</span>
        {hint && <span className="term-saved__hint">{hint}</span>}
      </div>

      {items.map((preset, index) => (
        <div key={preset.id}>
          <SavedRow
            preset={preset}
            index={index}
            hotkey={keys[index]}
            last={index === items.length - 1}
            onChange={(next) => onChange(items.map((item) => (item.id === next.id ? next : item)))}
            onMove={(delta) => onChange(reorderPresets(items, preset.id, index + delta))}
            onRemove={() => onChange(items.filter((item) => item.id !== preset.id))}
            onRoll={() => onRoll(preset)}
          />
          {keys.length > 0 && index === keys.length - 1 && index < items.length - 1 && (
            <div className="term-saved__divider">-- {t.term.notOnKeys} --</div>
          )}
        </div>
      ))}

      <button className="term-btn term-saved__add" onClick={saveField}>
        [{t.term.saveField}]
      </button>
      {error && <div className="term__error">?? {error}</div>}
    </section>
  )
}

interface RowProps {
  preset: Preset
  index: number
  hotkey: string | undefined
  last: boolean
  onChange: (preset: Preset) => void
  onMove: (delta: number) => void
  onRemove: () => void
  onRoll: () => void
}

/**
 * Правка уходит в список по Enter или при уходе с поля, а не на каждую
 * букву: список пишется в хранилище доски, и общий виден всей партии.
 */
const SavedRow = ({ preset, index, hotkey, last, onChange, onMove, onRemove, onRoll }: RowProps) => {
  const t = useT()
  const [name, setName] = useState(preset.name)
  const [formula, setFormula] = useState(preset.formula)
  const [invalid, setInvalid] = useState(false)

  // Список мог поменяться снаружи — например, общий бросок поправил другой игрок.
  useEffect(() => {
    setName(preset.name)
    setFormula(preset.formula)
    setInvalid(false)
  }, [preset.name, preset.formula])

  const commit = (): void => {
    let parsed
    try {
      parsed = parseFormula(formula.trim())
    } catch {
      setInvalid(true)
      return
    }
    setInvalid(false)

    const next = { ...preset, name: name.trim() || parsed.label || "", formula: parsed.expression }
    if (next.name !== preset.name || next.formula !== preset.formula) onChange(next)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") commit()
    if (event.key === "Escape") {
      setName(preset.name)
      setFormula(preset.formula)
      setInvalid(false)
    }
  }

  const n = index + 1

  return (
    <div className={`term-saved__row${hotkey ? " term-saved__row--key" : ""}`}>
      <button
        className="term-btn term-saved__key"
        onClick={onRoll}
        disabled={invalid}
        aria-label={t.term.rollIt(preset.name || preset.formula)}
        title={t.term.rollIt(preset.formula)}
      >
        {hotkey ?? "[>]"}
      </button>
      <input
        className="term-saved__field term-saved__name"
        type="text"
        autocomplete="off"
        spellcheck={false}
        aria-label={t.term.name(n)}
        value={name}
        onInput={(event) => setName((event.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <input
        className={`term-saved__field${invalid ? " term-saved__field--invalid" : ""}`}
        type="text"
        autocomplete="off"
        spellcheck={false}
        aria-label={t.term.formulaOf(n)}
        aria-invalid={invalid}
        value={formula}
        onInput={(event) => setFormula((event.target as HTMLInputElement).value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <button className="term-btn term-saved__icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label={t.term.up}>
        ^
      </button>
      <button className="term-btn term-saved__icon" onClick={() => onMove(1)} disabled={last} aria-label={t.term.down}>
        v
      </button>
      <button className="term-btn term-saved__icon term-saved__remove" onClick={onRemove} aria-label={t.term.remove}>
        x
      </button>
    </div>
  )
}
