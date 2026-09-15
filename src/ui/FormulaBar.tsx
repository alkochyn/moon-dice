import { useRef, useState } from "preact/hooks"

interface Props {
  formula: string
  error: string | null
  formulaHistory: string[]
  onFormulaChange: (value: string) => void
  onRoll: (formula: string) => void
  onSaveCurrent: () => void
  onOpenSettings: () => void
  onOpenHelp: () => void
}

/** Поле ввода стоит прямо над историей: бросок и его результат рядом. */
export const FormulaBar = ({
  formula,
  error,
  formulaHistory,
  onFormulaChange,
  onRoll,
  onSaveCurrent,
  onOpenSettings,
  onOpenHelp,
}: Props) => {
  const inputRef = useRef<HTMLInputElement>(null)
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
          Формула броска
        </label>
        <input
          id="formula"
          ref={inputRef}
          className={`input input--compact${error ? " input--invalid" : ""}`}
          type="text"
          inputMode="text"
          autocomplete="off"
          spellcheck={false}
          placeholder="1d20+1d5+6 : атака"
          value={formula}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          title="Enter — бросок, ↑/↓ — прошлые формулы"
        />
        <button className="btn btn--compact btn--primary" onClick={() => onRoll(formula)}>
          Бросок
        </button>
        <button
          className="btn btn--compact btn--icon"
          onClick={onSaveCurrent}
          title="Сохранить формулу в свои броски"
        >
          ★
        </button>
        <button
          className="btn btn--compact btn--icon"
          onClick={onOpenHelp}
          title="Как кидать"
          aria-label="Справка"
        >
          ?
        </button>
        <button
          className="btn btn--compact btn--icon"
          onClick={onOpenSettings}
          title="Настройки игрока"
          aria-label="Настройки игрока"
        >
          ⚙
        </button>
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  )
}
