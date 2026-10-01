import type { JSX } from "preact"
import { findDiceSet } from "../data/diceSets"
import { DieIcon, dieSides } from "./DieIcon"
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

/*
 * Оттенок каждого куба подобран вручную. Плавная шкала по числу граней
 * давала соседям в цепочке DCC (d4, d5, d6, d7) почти одинаковый цвет, а
 * здесь соседи по цепочке всегда заметно различаются. Оттенок привязан к
 * кубу, а не к месту в наборе: d20 синий и в стандартном наборе, и в DCC,
 * и глаз со временем находит куб по цвету, не читая надпись.
 */
const DIE_HUES: Record<number, number> = {
  2: 300,
  3: 160,
  4: 0,
  5: 80,
  6: 28,
  7: 250,
  8: 46,
  10: 140,
  12: 180,
  14: 330,
  16: 100,
  20: 220,
  24: 15,
  30: 195,
  100: 275,
}

function dieStyle(die: string): JSX.CSSProperties | undefined {
  const sides = dieSides(die)
  if (!sides || sides < 2) return undefined
  // Куб не из таблицы (d7 в формуле — не повод падать) берёт оттенок по шкале.
  const hue = DIE_HUES[sides] ?? Math.round((Math.log(sides / 2) / Math.log(50)) * 285)
  return { "--h": hue } as JSX.CSSProperties
}
