import { useEffect } from "preact/hooks"

import { LIMITS } from "../dice"

interface Props {
  onClose: () => void
}

/** Что можно написать в формуле. Примеры взяты из тестов движка. */
const FORMULAS: Array<[string, string]> = [
  ["d20", "один куб; можно писать и 1d20"],
  ["2d6", "несколько кубов сразу"],
  ["2d6+3", "куб и модификатор"],
  ["1d20+1d5+6", "сколько угодно кубов и чисел"],
  ["10-1d6", "вычитание"],
  ["(1d6+2)*2", "скобки и умножение"],
  ["1d10/3", "деление, всегда вниз"],
  ["4d6kh3", "бросить 4, оставить 3 лучших"],
  ["2d20kl1", "оставить худший; без числа kh и kl оставляют один"],
  ["d20adv", "с преимуществом: два куба, берётся лучший"],
  ["d20dis", "с помехой: два куба, берётся худший"],
  ["1d6!", "взрывной: на максимуме кидается ещё раз"],
  ["3#1d20+5", "три отдельных броска одной командой"],
  ["1d20+5 : атака", "подпись после двоеточия, её увидит вся партия"],
]

/** Как читать разбор броска во второй строке карточки. */
const NOTATION: Array<[string, string]> = [
  ["[14]", "что выпало на кубе"],
  ["[5, 3, (1)]", "в скобках отброшенный куб"],
  ["[6!6!2]", "взрывы: два раза выпал максимум"],
]

const CONTROLS: Array<[string, string]> = [
  ["кубик, Enter", "кинуть то, что в поле"],
  ["↑ и ↓", "прошлые формулы, как в терминале"],
  ["★ у поля", "сохранить бросок в открытую вкладку"],
  ["Мои, Общие", "свои броски и общие для всей партии"],
  ["basic, DCC", "обычные кубы и цепочка Dungeon Crawl Classics"],
  ["▴", "свернуть кубы, чтобы освободить место истории"],
  ["↻ в истории", "перебросить вместе с названием"],
  ["★ на формуле", "сохранить этот бросок себе"],
  ["✎ и × на броске", "изменить или удалить; появляются при наведении"],
  ["перетаскивание", "менять порядок сохранённых бросков"],
  ["⚙", "имя персонажа, значок, цвет и диагностика"],
]

const Table = ({ title, rows }: { title: string; rows: Array<[string, string]> }) => (
  <>
    <h3 className="help__title">{title}</h3>
    <dl className="help__list">
      {rows.map(([term, description]) => (
        <div key={term} className="help__row">
          <dt className="help__term">{term}</dt>
          <dd className="help__text">{description}</dd>
        </div>
      ))}
    </dl>
  </>
)

export const Help = ({ onClose }: Props) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Справка">
        <div className="modal__head">
          <span className="modal__title">Как кидать</span>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="help">
          <Table title="Формулы" rows={FORMULAS} />
          <Table title="Разбор броска" rows={NOTATION} />
          <Table title="Кнопки" rows={CONTROLS} />

          <p className="modal__hint">
            Регистр не важен, пробелы можно ставить где удобно. За раз можно кинуть до {LIMITS.maxCount} кубов, граней
            у куба до {LIMITS.maxSides}, повторов через # до {LIMITS.maxRepeat}. Кубы честные: бросок берётся из
            криптографического генератора браузера, а не из Math.random.
          </p>
        </div>
      </div>
    </div>
  )
}
