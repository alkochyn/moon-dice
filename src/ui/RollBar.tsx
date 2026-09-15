import { useRef, useState } from "preact/hooks"
import { DICE_SETS, findDiceSet } from "../data/diceSets"

interface Props {
  formula: string
  error: string | null
  formulaHistory: string[]
  diceSet: string
  onDiceSetChange: (id: string) => void
  onFormulaChange: (value: string) => void
  onRoll: (formula: string) => void
  onSaveCurrent: () => void
}

export const RollBar = ({
  formula,
  error,
  formulaHistory,
  diceSet,
  onDiceSetChange,
  onFormulaChange,
  onRoll,
  onSaveCurrent,
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

  const dice = findDiceSet(diceSet).dice

  return (
    <div className="rollbar">
      <div className="rollbar__row">
        <label className="sr-only" htmlFor="formula">
          Формула броска
        </label>
        <input
          id="formula"
          ref={inputRef}
          className={`input${error ? " input--invalid" : ""}`}
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
        <button className="btn btn--primary" onClick={() => onRoll(formula)}>
          Бросок
        </button>
        <button className="btn btn--icon" onClick={onSaveCurrent} title="Сохранить формулу в пресеты">
          ★
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {DICE_SETS.length > 1 && (
        <div className="tabs tabs--sets">
          {DICE_SETS.map((set) => (
            <button
              key={set.id}
              className={`tab${set.id === diceSet ? " tab--active" : ""}`}
              onClick={() => onDiceSetChange(set.id)}
              title={`Набор кубов: ${set.title}`}
            >
              {set.title}
            </button>
          ))}
        </div>
      )}

      <div className="dice-grid">
        {dice.map((item) => (
          <button key={item} className="btn" onClick={() => onRoll(item)} title={`Бросить ${item}`}>
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}
