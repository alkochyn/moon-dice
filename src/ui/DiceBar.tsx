import type { JSX } from "preact"
import { DICE_SETS, findDiceSet } from "../data/diceSets"
import { DieIcon, dieSides } from "./DieIcon"

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
            <button
              key={item}
              className="die"
              style={dieStyle(item)}
              onClick={() => onRoll(item)}
              title={`Бросить ${item}`}
            >
              <DieIcon die={item} />
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/*
 * У каждого куба свой оттенок по числу граней: от красного у d2 до фиолетового
 * у d100, по логарифмической шкале, иначе мелкие кубы слиплись бы в один цвет.
 * Оттенок привязан к кубу, а не к месту в наборе: d20 синий и в basic, и в DCC,
 * и глаз со временем находит куб по цвету, не читая надпись.
 */
function dieStyle(die: string): JSX.CSSProperties | undefined {
  const sides = dieSides(die)
  if (!sides || sides < 2) return undefined
  const hue = Math.round((Math.log(sides / 2) / Math.log(50)) * 285)
  return { "--h": hue } as JSX.CSSProperties
}
