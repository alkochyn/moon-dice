import { DICE_SETS, findDiceSet } from "../data/diceSets"

interface Props {
  diceSet: string
  collapsed: boolean
  onDiceSetChange: (id: string) => void
  onToggleCollapsed: () => void
  onRoll: (formula: string) => void
}

export const DiceBar = ({ diceSet, collapsed, onDiceSetChange, onToggleCollapsed, onRoll }: Props) => {
  const dice = findDiceSet(diceSet).dice

  return (
    <div className="dicebar">
      <div className="dicebar__head">
        <div className="tabs">
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

        <span className="section__spacer" />

        <button
          className="btn btn--ghost btn--icon"
          onClick={onToggleCollapsed}
          title={collapsed ? "Показать кубы" : "Свернуть кубы"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▾" : "▴"}
        </button>
      </div>

      {!collapsed && (
        <div className="dice-grid">
          {dice.map((item) => (
            <button key={item} className="btn" onClick={() => onRoll(item)} title={`Бросить ${item}`}>
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
