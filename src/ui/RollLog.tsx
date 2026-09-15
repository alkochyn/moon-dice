import type { RollEntry } from "../board/log"
import { Avatar } from "./Avatar"

interface Props {
  entries: RollEntry[]
  currentUserId: string
  /** Отдаём запись целиком: в перебросе должно ехать и название броска. */
  onRepeat: (entry: RollEntry) => void
  onSave: (entry: RollEntry) => void
}

const time = (ts: number): string => new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

const fullTime = (ts: number): string => new Date(ts).toLocaleString("ru-RU")

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
            >
              <div className="entry__body">
                <div className="entry__line">
                  <Avatar
                    name={entry.userName}
                    userId={entry.userId}
                    {...(entry.icon ? { icon: entry.icon } : {})}
                    {...(entry.color ? { color: entry.color } : {})}
                  />
                  <span className="entry__user">{entry.userName}</span>
                  {entry.label && <span className="entry__label">{entry.label}</span>}
                </div>

                <div className="entry__line entry__line--roll">
                  {/* Переброс стоит слева и виден всегда: при наведении сама
                      формула скрывается под звёздочкой, и кликать было бы не по чему. */}
                  <button
                    className="entry__repeat"
                    onClick={() => onRepeat(entry)}
                    aria-label={`Перебросить ${entry.expression}`}
                  >
                    ↻
                  </button>

                  <span className="entry__roll">
                    <button className="entry__formula" onClick={() => onRepeat(entry)}>
                      {entry.expression}
                    </button>
                    {/* Звёздочка всплывает поверх формулы, перекрывая её собой. */}
                    <span className="entry__actions">
                      <button
                        className="entry__action"
                        onClick={() => onSave(entry)}
                        aria-label={`Сохранить ${entry.expression}`}
                      >
                        ★ сохранить
                      </button>
                    </span>
                  </span>

                  <span className="entry__arrow">→</span>
                  <span className="entry__detail">{detail}</span>
                </div>
              </div>

              <span className={`entry__totals${entry.results.length > 1 ? " entry__totals--many" : ""}`}>
                {entry.results.map((result, index) => (
                  <span key={index} className="entry__total">
                    {result.total}
                  </span>
                ))}
                <span className="entry__time" title={fullTime(entry.ts)}>
                  {time(entry.ts)}
                </span>
              </span>
            </article>
          )
        })}
      </div>
    )}
  </section>
)
