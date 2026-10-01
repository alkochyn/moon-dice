import { findDiceSet } from "../data/diceSets"
import { DieIcon } from "./DieIcon"
import { dieStyle } from "./dieColor"
import { useT } from "../i18n"

interface Props {
  diceSet: string
  onRoll: (formula: string) => void
}

/** Кубы текущего набора; вкладки и сворачивание — в PanelTabs. */
export const DiceBar = ({ diceSet, onRoll }: Props) => {
  const t = useT()
  const dice = findDiceSet(diceSet).dice

  return (
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
  )
}
