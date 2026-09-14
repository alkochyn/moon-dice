import { useEffect, useState } from "preact/hooks"
import type { RollEntry } from "../board/log"

interface Props {
  entries: RollEntry[]
  currentUserId: string
  onRepeat: (formula: string) => void
  onClear: () => void
}

const time = (ts: number): string => new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

export const RollLog = ({ entries, currentUserId, onRepeat, onClear }: Props) => {
  // Журнал общий для всей партии, поэтому чистка — в два клика, без confirm(),
  // который в iframe может быть заблокирован.
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return undefined
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])

  const handleClear = (): void => {
    if (confirming) {
      onClear()
      setConfirming(false)
    } else {
      setConfirming(true)
    }
  }

  return (
    <section className="section">
      <div className="section__head">
        <span className="section__title">История бросков</span>
        <span className="section__spacer" />
        {entries.length > 0 && (
          <button className="btn btn--ghost" onClick={handleClear} title="Очистить историю бросков">
            {confirming ? "точно очистить?" : "очистить"}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="empty">Бросков ещё не было.</div>
      ) : (
        <div className="log">
          {entries.map((entry) => (
            <article key={entry.id} className={`entry${entry.userId === currentUserId ? " entry--mine" : ""}`}>
              <header className="entry__head">
                <span className="entry__user">{entry.userName}</span>
                {entry.label && <span className="entry__label">{entry.label}</span>}
                <span className="entry__time">{time(entry.ts)}</span>
              </header>

              {entry.results.map((result, index) => (
                <div key={index} className="entry__result">
                  <span className="entry__total">{result.total}</span>
                  <span className="entry__detail">{result.detail}</span>
                </div>
              ))}

              <button
                className="entry__formula btn btn--ghost"
                onClick={() => onRepeat(entry.expression)}
                title="Повторить бросок"
              >
                ↻ {entry.expression}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
