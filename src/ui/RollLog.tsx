import { useEffect, useRef } from "preact/hooks"

import type { RollEntry } from "../board/log"
import { useT } from "../i18n"
import { Avatar } from "./Avatar"
import { RepeatIcon, SaveIcon, SwordsIcon } from "./icons"

interface Props {
  entries: RollEntry[]
  currentUserId: string
  /** Отдаём запись целиком: в перебросе должно ехать и название броска. */
  onRepeat: (entry: RollEntry) => void
  onSave: (entry: RollEntry) => void
}

const time = (ts: number, locale: string): string =>
  new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })

const fullTime = (ts: number, locale: string): string => new Date(ts).toLocaleString(locale)

/* Расклад под суммой, если он что-то добавляет: у одного куба без
   модификаторов он повторял бы сумму — «7» и «[7]». */
const Detail = ({ result }: { result: { total: number; detail: string } }) =>
  result.detail === String(result.total) || result.detail === `[${result.total}]` ? null : (
    <span className="entry__tile-detail" title={result.detail}>
      {result.detail}
    </span>
  )

/** Значок монстра в порядке ходов: свой у всех, чтобы монстры не путались с игроками. */
const MONSTER_ICON = "goblin-head"
const MONSTER_COLOR = "#475569"

/**
 * Инициатива — не обычный бросок, а порядок ходов: строки уже выстроены, у
 * каждой номер, имя персонажа и сумма справа. Карточка выделена, чтобы в
 * потоке бросков её было видно издалека, — к ней возвращаются весь бой.
 */
const InitiativeEntry = ({ entry, locale }: { entry: RollEntry; locale: string }) => {
  const t = useT()

  return (
    <article className="entry entry--initiative">
      <div className="entry__body">
        <div className="entry__line">
          <SwordsIcon className="initiative__icon" />
          <span className="initiative__title">{t.combat.title}</span>
          <span className="entry__label">{t.combat.rolledBy(entry.userName)}</span>
        </div>

        <ol className="initiative">
          {entry.results.map((result, index) => (
            <li key={index} className={`initiative__row${result.npc ? " initiative__row--npc" : ""}`}>
              <span className="initiative__place">{index + 1}</span>
              <Avatar
                name={result.name ?? ""}
                userId={result.userId ?? result.name ?? ""}
                {...(result.npc ? { icon: MONSTER_ICON, color: MONSTER_COLOR } : {})}
                {...(!result.npc && result.icon ? { icon: result.icon } : {})}
                {...(!result.npc && result.color ? { color: result.color } : {})}
              />
              <span className="initiative__name">{result.name}</span>
              <span
                className="initiative__detail"
                title={result.expression ? `${result.expression} → ${result.detail}` : result.detail}
              >
                {result.detail}
              </span>
              <span className="initiative__total">{result.total}</span>
            </li>
          ))}
        </ol>

        <span className="entry__time" title={fullTime(entry.ts, locale)}>
          {time(entry.ts, locale)}
        </span>
      </div>
    </article>
  )
}

export const RollLog = ({ entries, currentUserId, onRepeat, onSave }: Props) => {
  const t = useT()
  const logRef = useRef<HTMLDivElement>(null)
  const topId = useRef<string | undefined>(undefined)

  // Свой бросок появляется сверху; если историю отмотали вниз, возвращаем к
  // нему. Чужие броски прокрутку не трогают — вдруг игрок что-то читает.
  const newest = entries[0]
  useEffect(() => {
    const previous = topId.current
    topId.current = newest?.id
    if (!newest || !previous || newest.id === previous || newest.userId !== currentUserId) return
    logRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [newest, currentUserId])

  return (
  <section className="section section--log">
    <div className="section__head">
      <span className="section__title">{t.log.title}</span>
    </div>

    {entries.length === 0 ? (
      <div className="empty">{t.log.empty}</div>
    ) : (
      <div ref={logRef} className="log">
        {entries.map((entry) => {
          if (entry.kind === "initiative") return <InitiativeEntry key={entry.id} entry={entry} locale={t.locale} />

          // `6#3d6` — это шесть отдельных бросков, и каждый показывается своей
          // плиткой: сумма крупно, расклад под ней. Одной строкой с колонкой
          // сумм сбоку было не понять, какой расклад к какой сумме относится.
          const repeated = entry.results.length > 1

          return (
            <article
              key={entry.id}
              className={`entry${repeated ? " entry--repeated" : ""}${entry.userId === currentUserId ? " entry--mine" : ""}`}
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

                  {/* Кто, что и зачем кинул — одной строкой; расклад уходит ниже.
                      Переброс и звёздочка всплывают поверх формулы при наведении. */}
                  <span className="entry__roll">
                    <button className="entry__formula" onClick={() => onRepeat(entry)}>
                      {entry.expression}
                    </button>
                    <span className="entry__actions">
                      <button
                        className="entry__action"
                        onClick={() => onRepeat(entry)}
                        aria-label={t.log.rerollNamed(entry.expression)}
                        title={t.log.reroll}
                      >
                        <RepeatIcon />
                      </button>
                      <button
                        className="entry__action"
                        onClick={() => onSave(entry)}
                        aria-label={t.log.saveNamed(entry.expression)}
                        title={t.log.save}
                      >
                        <SaveIcon />
                      </button>
                    </span>
                  </span>

                  {entry.label && <span className="entry__label">{entry.label}</span>}
                </div>

                {repeated && (
                  <div className="entry__tiles">
                    {entry.results.map((result, index) => (
                      <div key={index} className="entry__tile">
                        <span className="entry__tile-total">{result.total}</span>
                        <Detail result={result} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Время у всех карточек в левом нижнем углу, под броском. */}
                <span className="entry__time" title={fullTime(entry.ts, t.locale)}>
                  {time(entry.ts, t.locale)}
                </span>
              </div>

              {/* Одиночный бросок — та же плитка, что у повторных, только справа
                  во всю высоту карточки: сумма крупно, расклад под ней. */}
              {!repeated && entry.results[0] && (
                <span className="entry__total">
                  <span className="entry__total-value">{entry.results[0].total}</span>
                  <Detail result={entry.results[0]} />
                </span>
              )}
            </article>
          )
        })}
      </div>
    )}
  </section>
  )
}
