import { useEffect } from "preact/hooks"

import { LIMITS } from "../dice"
import { useT } from "../i18n"

interface Props {
  /** В терминале своё управление: команды, F-клавиши, экран своих бросков. */
  terminal?: boolean
  onClose: () => void
}

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

export const Help = ({ terminal = false, onClose }: Props) => {
  const t = useT()

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={t.help.title}>
        <div className="modal__head">
          <span className="modal__title">{t.help.title}</span>
        </div>

        <div className="help">
          <Table title={t.help.formulas} rows={t.help.formulaRows} />
          <Table title={t.help.notation} rows={t.help.notationRows} />
          {terminal ? (
            <Table title={t.help.terminal} rows={t.help.terminalRows} />
          ) : (
            <Table title={t.help.controls} rows={t.help.controlRows} />
          )}

          <p className="modal__hint">
            {t.help.limits(LIMITS.maxCount, LIMITS.maxSides, LIMITS.maxRepeat)}
          </p>
        </div>

        {/*
          Кнопка закрытия прилипла к низу окна. Крестик сверху при прокрутке
          уезжал и оказывался ровно под крестиком самой панели Miro — промах
          закрывал не справку, а всё приложение.
        */}
        <div className="modal__footer">
          <button className="btn" onClick={onClose}>
            {t.help.close}
          </button>
        </div>
      </div>
    </div>
  )
}
