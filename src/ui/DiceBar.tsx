import { findDiceSet } from "../data/diceSets"
import { DieIcon } from "./DieIcon"
import { dieStyle } from "./dieColor"
import { useT } from "../i18n"
import { ChevronIcon } from "./icons"

interface Props {
  diceSet: string
  collapsed: boolean
  onToggleCollapsed: () => void
  onRoll: (formula: string) => void
}

export const DiceBar = ({ diceSet, collapsed, onToggleCollapsed, onRoll }: Props) => {
  const t = useT()
  const dice = findDiceSet(diceSet).dice

  return (
    // Стрелка сворачивания стоит справа в одном ряду с кубами: своя строка под
    // одну стрелку отнимала у журнала высоту, ничего не сообщая.
    <div className={`dicebar${collapsed ? " dicebar--collapsed" : ""}`}>
      {!collapsed && (
        <div className="dice-grid">
          {dice.map((item) => (
            <button
              key={item}
              className="die"
              style={dieStyle(item)}
              onClick={() => onRoll(item)}
              title={t.dice.roll(item)}
            >
              <DieIcon die={item} />
              {item}
            </button>
          ))}
        </div>
      )}

      <button
        className="btn btn--ghost btn--icon dicebar__toggle"
        onClick={onToggleCollapsed}
        title={collapsed ? t.dice.show : t.dice.hide}
        aria-label={collapsed ? t.dice.show : t.dice.hide}
        aria-expanded={!collapsed}
      >
        <ChevronIcon className={collapsed ? "icon--flipped" : undefined} />
      </button>
    </div>
  )
}
