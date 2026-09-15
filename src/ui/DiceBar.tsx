import { DICE_SETS, findDiceSet } from "../data/diceSets"

interface Props {
  diceSet: string
  collapsed: boolean
  onDiceSetChange: (id: string) => void
  onToggleCollapsed: () => void
  onRoll: (formula: string) => void
  onOpenHelp: () => void
  onOpenSettings: () => void
}

export const DiceBar = ({
  diceSet,
  collapsed,
  onDiceSetChange,
  onToggleCollapsed,
  onRoll,
  onOpenHelp,
  onOpenSettings,
}: Props) => {
  const dice = findDiceSet(diceSet).dice

  return (
    <div className="dicebar">
      <div className="dicebar__head">
        <button
          className="btn btn--ghost btn--icon"
          onClick={onToggleCollapsed}
          title={collapsed ? "Показать кубы" : "Свернуть кубы"}
          aria-expanded={!collapsed}
        >
          {collapsed ? "▾" : "▴"}
        </button>

        <div className="tabs">
          {DICE_SETS.map((set) => (
            <button
              key={set.id}
              className={`tab${set.id === diceSet ? " tab--active" : ""}`}
              onClick={() => onDiceSetChange(set.id)}
              title={set.hint}
            >
              {set.title}
            </button>
          ))}
        </div>

        <span className="section__spacer" />

        <button className="btn btn--ghost btn--icon" onClick={onOpenHelp} title="Как кидать" aria-label="Справка">
          ?
        </button>
        <button
          className="btn btn--ghost btn--icon"
          onClick={onOpenSettings}
          title="Настройки игрока"
          aria-label="Настройки игрока"
        >
          ⚙
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
