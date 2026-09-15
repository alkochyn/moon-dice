import type { RollEntry } from "../board/log"
import { Avatar } from "./Avatar"

interface Props {
  entries: RollEntry[]
  currentUserId: string
  onRepeat: (formula: string) => void
}

const time = (ts: number): string => new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

export const RollLog = ({ entries, currentUserId, onRepeat }: Props) => (
  <section className="section section--log">
    <div className="section__head">
      <span className="section__title">История бросков</span>
    </div>

    {entries.length === 0 ? (
      <div className="empty">Бросков ещё не было.</div>
    ) : (
      <div className="log">
        {entries.map((entry) => (
          <article key={entry.id} className={`entry${entry.userId === currentUserId ? " entry--mine" : ""}`}>
            <header className="entry__head">
              <Avatar name={entry.userName} userId={entry.userId} />
              <span className="entry__user">{entry.userName}</span>
              <span className="entry__time">{time(entry.ts)}</span>
            </header>

            {entry.label && <div className="entry__label">{entry.label}</div>}

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
