import { useRef, useState } from "preact/hooks"

import { useT } from "../i18n"
import { PALETTE_HUES } from "./dieColor"
import { RollIcon, SaveIcon } from "./icons"

interface Props {
  formula: string
  error: string | null
  formulaHistory: string[]
  onFormulaChange: (value: string) => void
  onRoll: (formula: string) => void
  onSaveCurrent: () => void
}

/** Поле ввода стоит прямо над историей: бросок и его результат рядом. */
export const FormulaBar = ({
  formula,
  error,
  formulaHistory,
  onFormulaChange,
  onRoll,
  onSaveCurrent,
}: Props) => {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  // Кнопка броска перекрашивается при каждом наведении в другой цвет из
  // палитры кубов. Стартует синей, как d20.
  const [rollHue, setRollHue] = useState(220)
  const shuffleHue = (): void =>
    setRollHue((current) => {
      const others = PALETTE_HUES.filter((hue) => hue !== current)
      return others[Math.floor(Math.random() * others.length)] ?? current
    })
  // -1 — «сейчас в поле то, что набрал игрок», иначе индекс в истории.
  const [cursor, setCursor] = useState(-1)

  const handleInput = (event: Event): void => {
    onFormulaChange((event.target as HTMLInputElement).value)
    setCursor(-1)
  }

  const stepHistory = (delta: number): void => {
    if (!formulaHistory.length) return
    const next = cursor + delta

    if (next < 0) {
      setCursor(-1)
      onFormulaChange("")
      return
    }
    if (next >= formulaHistory.length) return

    setCursor(next)
    onFormulaChange(formulaHistory[next] as string)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      onRoll(formula)
      setCursor(-1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      stepHistory(1)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      stepHistory(-1)
    }
  }

  return (
    <div className="rollbar">
      <div className="rollbar__row">
        <label className="sr-only" htmlFor="formula">
          {t.formula.label}
        </label>
        <input
          id="formula"
          ref={inputRef}
          className={`input input--compact${error ? " input--invalid" : ""}`}
          type="text"
          inputMode="text"
          autocomplete="off"
          spellcheck={false}
          placeholder={t.formula.placeholder}
          value={formula}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          title={t.formula.hint}
        />
        {/* Кнопка броска — такой же куб, как кнопки наверху: тот же объём и
            подъём под курсором. */}
        <button
          className="die die--roll"
          style={{ "--h": rollHue }}
          onMouseEnter={shuffleHue}
          onClick={() => onRoll(formula)}
          title={t.formula.roll}
          aria-label={t.formula.roll}
        >
          <RollIcon />
        </button>
        <button
          className="btn btn--compact btn--icon"
          onClick={onSaveCurrent}
          title={t.formula.save}
          aria-label={t.formula.save}
        >
          <SaveIcon />
        </button>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  )
}
