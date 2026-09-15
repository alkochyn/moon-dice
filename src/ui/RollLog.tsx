import type { RollEntry } from "../board/log"
import { Avatar } from "./Avatar"

interface Props {
  entries: RollEntry[]
  currentUserId: string
  onRepeat: (formula: string) => void
  onSave: (entry: RollEntry) => void
}

const time = (ts: number): string => new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

export const RollLog = ({ entries, currentUserId, onRepeat, onSave }: Props) => (
  <section className="section section--log">
    <div className="section__head">
      <span className="section__title">История бросков</span>
    </div>

    {entries.length === 0 ? (
      <div className="empty">Бросков ещё не было.</div>
    ) : (
      <div className="log">
        {entries.map((entry) => {
          // Расклад всех повторов в одну строку: `3#1d20` даёт три результата,
          // но лишней строки в карточке от этого не появляется.
          const detail = entry.results.map((result) => result.detail).join(" · ")

          return (
            <article
              key={entry.id}
              className={`entry${entry.userId === currentUserId ? " entry--mine" : ""}`}
              title={`${entry.userName}, ${time(entry.ts)}`}
            >
              <div className="entry__body">
                <div className="entry__line">
                  <Avatar name={entry.userName} userId={entry.userId} />
                  <span className="entry__user">{entry.userName}</span>
                  {entry.label && <span className="entry__label">{entry.label}</span>}

                  <span className="entry__roll">
                    <button className="entry__formula" onClick={() => onRepeat(entry.expression)} title="Перебросить">
                      {entry.expression}
                    </button>
                    <span className="entry__actions">
                      <button
                        className="entry__action"
                        onClick={() => onRepeat(entry.expression)}
                        title="Перебросить"
                        aria-label={`Перебросить ${entry.expression}`}
                      >
                        ↻
                      </button>
                      <button
                        className="entry__action"
                        onClick={() => onSave(entry)}
                        title="Сохранить этот бросок"
                        aria-label={`Сохранить ${entry.expression}`}
                      >
                        ★
                      </button>
                    </span>
                  </span>
                </div>

                <div className="entry__detail" title={detail}>
                  {detail}
                </div>
              </div>

              <span className={`entry__totals${entry.results.length > 1 ? " entry__totals--many" : ""}`}>
                {entry.results.map((result, index) => (
                  <span key={index} className="entry__total">
                    {result.total}
                  </span>
                ))}
              </span>
            </article>
          )
        })}
      </div>
    )}
  </section>
)
