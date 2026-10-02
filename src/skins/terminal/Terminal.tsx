import { Fragment, type ComponentChildren } from "preact"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks"

import "./terminal.css"
import type { RollEntry } from "../../board/log"
import type { Preset } from "../../board/presets"
import type { BoardStatus } from "../../board/sdk"
import { findDiceSet } from "../../data/diceSets"
import { parseFormula, validateFormula } from "../../dice"
import { useT } from "../../i18n"
import {
  AsciiFire,
  artLayout,
  bigNumber,
  dieArt,
  naturalOf,
  rollArtOf,
  skullArt,
  SWORD,
  type AsciiDie,
  type Natural,
  type RollArt,
} from "./ascii"
import { SavedRolls } from "./SavedRolls"

const SCREEN_KEY = "dice.term.screen.v1"
const SCREENS = ["amber", "green", "ice"] as const
type Screen = (typeof SCREENS)[number]
export const F_KEYS = ["F1", "F2", "F3", "F4"]

/** Огонь горит чуть дольше двух секунд, последнюю треть — опадает. */
const BURN_MS = 2600
const FADE_MS = 1700
const RATTLE_MS = 2000
/** Пасхалки срабатывают только на свежие броски, а не на подгруженную историю. */
const FRESH_MS = 15000
/** Больше кубов в строку не влезет ни в какую панель — их и не рисуем. */
const MAX_DRAWN_DICE = 12
/** Зазор между кубами, мечом и суммой в строке броска — как в CSS. */
const ROW_GAP = 10

type Tab = "log" | "saved" | "init"

interface Props {
  status: BoardStatus
  shareError: string | null
  entries: RollEntry[]
  currentUserId: string
  playerName: string
  diceSet: string
  personal: Preset[]
  shared: Preset[]
  formula: string
  error: string | null
  formulaHistory: string[]
  postToBoard: boolean
  /** Вкладка боя — тот же компонент, что в обычном облике. */
  combat: ComponentChildren
  /** Модальные окна: рендерятся внутри скина, чтобы взять его цвета. */
  children?: ComponentChildren
  onFormulaChange: (value: string) => void
  /** Ошибка разбора висит, пока игрок не начал править строку. */
  onDismissError: () => void
  onRoll: (formula: string, presetName?: string) => void
  onSavePersonal: (items: Preset[]) => void
  onSaveShared: (items: Preset[]) => void
  onRepeat: (entry: RollEntry) => void
  onSaveEntry: (entry: RollEntry) => void
  onTogglePostToBoard: (next: boolean) => void
  onOpenHelp: () => void
  onOpenSettings: () => void
}

const readScreen = (): Screen => {
  try {
    const saved = JSON.parse(localStorage.getItem(SCREEN_KEY) ?? "null") as unknown
    return SCREENS.includes(saved as Screen) ? (saved as Screen) : "amber"
  } catch {
    return "amber"
  }
}

const clock = (ts: number, locale: string): string =>
  new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })

/** Имя в приглашении — первое слово персонажа, как логин в шелле. */
const promptOf = (name: string): string =>
  (name.trim().split(/\s+/)[0] ?? "").toLowerCase().slice(0, 12) || "player"

/** Огонь в рамке броска: своя анимация, родитель при этом не перерисовывается. */
const Fire = ({ token, onDone }: { token: number; onDone: () => void }) => {
  const fire = useRef(new AsciiFire(64, 16))
  const [, setFrame] = useState(0)

  useEffect(() => {
    fire.current.reset()
    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      if (elapsed > BURN_MS) {
        clearInterval(timer)
        onDone()
        return
      }
      fire.current.step(elapsed > FADE_MS)
      setFrame((frame) => frame + 1)
    }, 80)
    return () => clearInterval(timer)
  }, [token])

  return (
    <div className="term-fire" aria-hidden="true">
      <div className="term-fire__flames">
        {fire.current.rows().map((row, index) => (
          <div key={index} className={`term-fire__row term-fire__row--${row.level}`}>
            {row.text}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Череп на натуральной 1: на пару секунд ложится поверх d20 и клацает
 * челюстью, потом исчезает — под ним остаётся сам куб с единицей.
 */
const Skull = ({ token }: { token: number }) => {
  const [chatter, setChatter] = useState(false)
  const [visible, setVisible] = useState(Boolean(token))

  useEffect(() => {
    if (!token) return undefined
    setVisible(true)
    const start = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - start > RATTLE_MS) {
        clearInterval(timer)
        setVisible(false)
        setChatter(false)
        return
      }
      setChatter((value) => !value)
    }, 140)
    return () => clearInterval(timer)
  }, [token])

  return visible ? (
    <pre className="term-skull" aria-hidden="true">
      {skullArt(chatter)}
    </pre>
  ) : null
}

interface EntryView {
  entry: RollEntry
  art: RollArt | null
  natural: Natural
}

const viewOf = (entry: RollEntry): EntryView => {
  const single = entry.kind !== "initiative" && entry.results.length === 1 ? entry.results[0] : undefined
  const art = single ? rollArtOf(entry.expression, single.detail) : null
  return { entry, art, natural: naturalOf(art?.dice ?? null) }
}

export const Terminal = ({
  status,
  shareError,
  entries,
  currentUserId,
  playerName,
  diceSet,
  personal,
  shared,
  formula,
  error,
  formulaHistory,
  postToBoard,
  combat,
  children,
  onFormulaChange,
  onDismissError,
  onRoll,
  onSavePersonal,
  onSaveShared,
  onRepeat,
  onSaveEntry,
  onTogglePostToBoard,
  onOpenHelp,
  onOpenSettings,
}: Props) => {
  const t = useT()
  const [tab, setTab] = useState<Tab>("log")
  const [screen, setScreen] = useState<Screen>(readScreen)
  const [cursor, setCursor] = useState(-1)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [burn, setBurn] = useState<{ id: string; token: number } | null>(null)
  const [rattle, setRattle] = useState<{ id: string; token: number } | null>(null)
  const seen = useRef(new Set<string>())
  const feedRef = useRef<HTMLDivElement>(null)
  // Свой бросок должен быть виден, даже если ленту отмотали назад: после
  // отрисовки докручиваем до него. Чужие броски ленту не дёргают.
  const scrollPending = useRef(false)
  // Ширина ленты: по ней каждый бросок решает, влезают ли его кубы в строку.
  const [feedWidth, setFeedWidth] = useState(0)
  useEffect(() => {
    const feed = feedRef.current
    if (!feed || typeof ResizeObserver === "undefined") return undefined
    const observer = new ResizeObserver(([item]) => setFeedWidth(Math.round(item?.contentRect.width ?? 0)))
    observer.observe(feed)
    return () => observer.disconnect()
  }, [tab])
  useEffect(() => {
    if (!scrollPending.current || tab !== "log") return
    scrollPending.current = false
    feedRef.current?.firstElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  })

  const views = useMemo(() => entries.map(viewOf), [entries])
  const ignite = (id: string): void => setBurn({ id, token: Date.now() })
  const shake = (id: string): void => setRattle({ id, token: Date.now() })

  // Огонь и череп — на свежий бросок, чей бы он ни был: партия видит
  // натуральную 20 соседа так же, как свою.
  useEffect(() => {
    const fresh = views.filter((view) => !seen.current.has(view.entry.id))
    for (const view of fresh) seen.current.add(view.entry.id)

    const newest = fresh[0]
    if (!newest || Date.now() - newest.entry.ts > FRESH_MS) return
    // Свой бросок — включая инициативу и F-клавиши с другого экрана — сразу
    // показываем в журнале.
    if (newest.entry.userId === currentUserId) {
      setTab("log")
      scrollPending.current = true
    }
    if (newest.natural === "crit") ignite(newest.entry.id)
    if (newest.natural === "fumble") shake(newest.entry.id)
  }, [views])

  const cycleScreen = (): void => {
    const next = SCREENS[(SCREENS.indexOf(screen) + 1) % SCREENS.length] as Screen
    setScreen(next)
    try {
      localStorage.setItem(SCREEN_KEY, JSON.stringify(next))
    } catch {
      // Цвет останется до перезагрузки.
    }
  }

  const rollPreset = (preset: Preset | undefined): void => {
    if (!preset) return
    onRoll(preset.formula, preset.name)
    setTab("log")
  }

  // F1–F4 работают, где бы ни стоял фокус: в этом и смысл горячих клавиш.
  const personalRef = useRef(personal)
  personalRef.current = personal
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const slot = F_KEYS.indexOf(event.key)
      if (slot < 0 || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      const preset = personalRef.current[slot]
      if (preset) onRoll(preset.formula, preset.name)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onRoll])

  /** /bind F2 1d8+3 : меч — кладёт бросок на клавишу, не открывая списка. */
  const bind = (args: string): void => {
    const match = /^f([1-4])\s+(.+)$/i.exec(args.trim())
    let parsed
    try {
      parsed = match ? parseFormula(match[2] as string) : null
    } catch {
      parsed = null
    }
    if (!match || !parsed) {
      setCommandError(t.term.bindUsage)
      return
    }

    const slot = Math.min(Number(match[1]) - 1, personal.length)
    const next = personal.slice()
    const existing = next[slot]
    next[slot] = {
      id: existing?.id ?? `bind-${Date.now().toString(36)}`,
      name: parsed.label ?? "",
      formula: parsed.expression,
      color: existing?.color ?? "slate",
    }
    onSavePersonal(next)
    onFormulaChange("")
    setTab("saved")
  }

  const runCommand = (source: string): void => {
    const [command = "", ...rest] = source.slice(1).split(/\s+/)
    const name = command.toLowerCase()
    setCommandError(null)

    if (name === "log" || name === "saved" || name === "init") {
      setTab(name)
      onFormulaChange("")
    } else if (name === "help") {
      onFormulaChange("")
      onOpenHelp()
    } else if (name === "settings") {
      onFormulaChange("")
      onOpenSettings()
    } else if (name === "bind") {
      bind(rest.join(" "))
    } else {
      setCommandError(t.term.unknownCommand(`/${command}`))
    }
  }

  const submit = (): void => {
    const source = formula.trim()
    if (!source) return
    setCursor(-1)
    if (source.startsWith("/")) {
      onDismissError()
      runCommand(source)
      return
    }

    // Строка после броска остаётся: ту же формулу часто кидают ещё раз или
    // правят на единицу. Журнал открывается, только если бросок удался.
    const ok = validateFormula(source).ok
    onRoll(source)
    if (ok) setTab("log")
  }

  const stepHistory = (delta: number): void => {
    const next = cursor + delta
    if (next < 0) {
      setCursor(-1)
      onFormulaChange("")
      return
    }
    if (next >= formulaHistory.length) return
    setCursor(next)
    onFormulaChange(formulaHistory[next] as string)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault()
      submit()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      stepHistory(1)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      stepHistory(-1)
    }
  }

  const statusText =
    status === "connected" ? `* ${t.term.online}` : status === "offline" ? `o ${t.term.offline}` : `~ ${t.term.connecting}`
  const message = commandError ?? error

  return (
    <div className={`term term--${screen}`}>
      <div className="term__head">
        <span className={`term__status term__status--${status}`}>{statusText}</span>
        <span className="term__head-actions">
          <button className="term-btn" onClick={onOpenHelp} title={t.term.help} aria-label={t.term.help}>
            [?]
          </button>
          <button className="term-btn" onClick={onOpenSettings}>
            [{t.term.settings}]
          </button>
          <button className="term-btn" onClick={cycleScreen} title={t.term.colour}>
            [{screen}]
          </button>
        </span>
      </div>

      <div className="term__screen">
        {tab === "log" && (
          <div ref={feedRef} className="term__feed" role="log" aria-live="polite">
            {views.length === 0 && <p className="term__empty">{t.term.empty}</p>}
            {views.map((view) => (
              <TermEntry
                key={view.entry.id}
                view={view}
                mine={view.entry.userId === currentUserId}
                width={feedWidth}
                burnToken={burn?.id === view.entry.id ? burn.token : 0}
                rattleToken={rattle?.id === view.entry.id ? rattle.token : 0}
                onBurnDone={() => setBurn(null)}
                onIgnite={() => ignite(view.entry.id)}
                onRattle={() => shake(view.entry.id)}
                onRepeat={() => onRepeat(view.entry)}
                onSave={() => onSaveEntry(view.entry)}
              />
            ))}
          </div>
        )}

        {tab === "saved" && (
          <div className="term__page">
            <SavedRolls
              title={t.term.mine}
              hint={t.term.fKeys}
              items={personal}
              keys={F_KEYS}
              field={formula}
              onChange={onSavePersonal}
              onRoll={rollPreset}
              onFieldUsed={() => onFormulaChange("")}
            />
            {status === "connected" ? (
              <SavedRolls
                title={t.term.party}
                items={shared}
                keys={[]}
                field={formula}
                onChange={onSaveShared}
                onRoll={rollPreset}
                onFieldUsed={() => onFormulaChange("")}
              />
            ) : (
              <p className="term__note">{t.term.partyOffline}</p>
            )}
            <p className="term__note">
              {t.term.bindHint} <code>/bind F2 1d8+3 : sword</code>
            </p>
          </div>
        )}

        {tab === "init" && <div className="term__page term__page--combat">{combat}</div>}
      </div>

      {shareError && <div className="term__warning">! {shareError}</div>}

      <div className="term__box">
        <span className="term__box-title">[ {t.term.formula} ]</span>
        <span className="term__box-hint">{t.term.orEnter}</span>
        <label className="term__prompt">
          <span className="term__user">{promptOf(playerName)} $</span>
          <input
            className="term__input"
            type="text"
            autocomplete="off"
            spellcheck={false}
            aria-label={t.formula.label}
            placeholder={t.formula.placeholder}
            value={formula}
            onInput={(event) => {
              onFormulaChange((event.target as HTMLInputElement).value)
              setCursor(-1)
              setCommandError(null)
              onDismissError()
            }}
            onKeyDown={onKeyDown}
          />
        </label>
        <button className="term__roll" onClick={submit}>
          {t.term.roll}
        </button>
      </div>
      {message && <div className="term__error">?? {message}</div>}

      <div className="term__keys">
        {findDiceSet(diceSet).dice.map((die) => (
          <button key={die} className="term-btn" onClick={() => onRoll(die)} aria-label={t.dice.roll(die)}>
            [{die}]
          </button>
        ))}
      </div>

      <div className="term__macros">
        {personal.slice(0, 4).map((preset, index) => (
          <button
            key={preset.id}
            className="term-btn term__macro"
            onClick={() => rollPreset(preset)}
            title={preset.name ? `${preset.name}: ${preset.formula}` : preset.formula}
          >
            <span className="term__fkey">{F_KEYS[index]}</span> {preset.name || preset.formula}
          </button>
        ))}
        <button className="term-btn term__edit" onClick={() => setTab("saved")} title={t.term.editTitle}>
          [{t.term.edit}]
        </button>
      </div>

      <div className="term__bar">
        {(["log", "saved", "init"] as const).map((id) => (
          <button
            key={id}
            className={`term__tab${tab === id ? " term__tab--active" : ""}`}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
          >
            {t.term.tabs[id]}
          </button>
        ))}
        <label className="term__post" title={t.term.postTitle}>
          <input
            type="checkbox"
            checked={postToBoard}
            disabled={status !== "connected"}
            onChange={(event) => onTogglePostToBoard((event.target as HTMLInputElement).checked)}
          />
          {t.term.post}
        </label>
      </div>

      {children}
    </div>
  )
}

interface EntryProps {
  view: EntryView
  mine: boolean
  /** Ширина ленты — меняется, значит, надо заново проверить, влезают ли кубы. */
  width: number
  burnToken: number
  rattleToken: number
  onBurnDone: () => void
  onIgnite: () => void
  onRattle: () => void
  onRepeat: () => void
  onSave: () => void
}

const TermEntry = ({ view, mine, width, burnToken, rattleToken, onBurnDone, onIgnite, onRattle, onRepeat, onSave }: EntryProps) => {
  const t = useT()
  const { entry, art, natural } = view
  const initiative = entry.kind === "initiative"
  const single = !initiative && entry.results.length === 1 ? entry.results[0] : undefined
  // Рисуем, только если картинка честная: сложение и вычитание, есть кубы.
  const drawable = art && art.linear && art.dice.length > 0 && art.dice.length <= MAX_DRAWN_DICE ? art : null

  // Влезает ли картинка в строку, видно только после раскладки: меряем её
  // ширину один раз и сравниваем с местом, что остаётся рядом с суммой. Не
  // влезла — показываем разбор текстом, а ширину помним, чтобы вернуть
  // картинку, если панель станет шире.
  const rowRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<HTMLDivElement>(null)
  const sumRef = useRef<HTMLDivElement>(null)
  const measured = useRef<{ art: number; sum: number } | null>(null)
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    if (!drawable) return
    if (artRef.current && sumRef.current) {
      measured.current = { art: artRef.current.scrollWidth, sum: sumRef.current.offsetWidth }
    }
    const row = rowRef.current
    if (!row || !measured.current) return
    const room = row.clientWidth - measured.current.sum - ROW_GAP * (row.children.length - 1)
    setFits(measured.current.art <= room)
  }, [width, drawable])
  const drawn = drawable && fits ? drawable : null
  const naturalIndex = natural && drawn ? drawn.dice.findIndex((die) => die.sides === 20 && die.kept) : -1
  const what = initiative ? t.combat.title : entry.expression
  const label = initiative ? undefined : entry.label

  const classes = [
    "term-entry",
    mine && "term-entry--mine",
    natural && `term-entry--${natural}`,
    burnToken && "term-entry--burning",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article className={classes}>
      {burnToken ? <Fire token={burnToken} onDone={onBurnDone} /> : null}

      {/* Кто, что и зачем — одной фразой слева, как строка в чате: «Judge Moon
          -> 1d20+1d4+5 бью правой». Время справа, оно нужно реже. */}
      <header className="term-entry__title">
        <span className="term-entry__what" title={label ? `${entry.userName} -> ${what} ${label}` : undefined}>
          <span className="term-entry__user">{entry.userName}</span>
          <span className="term-entry__arrow"> -&gt; </span>
          <span className="term-entry__expr">{what}</span>
          {label && <span className="term-entry__label"> {label}</span>}
        </span>
        <span className="term-entry__time">{clock(entry.ts, t.locale)}</span>
      </header>

      {initiative && (
        <ol className="term-entry__order">
          {entry.results.map((result, index) => (
            <li key={index} title={result.expression ? `${result.expression} → ${result.detail}` : result.detail}>
              <span>{index + 1}.</span>
              <span className="term-entry__order-name">{result.name}</span>
              <span className="term-entry__order-total">{result.total}</span>
            </li>
          ))}
        </ol>
      )}

      {!initiative && entry.results.length > 1 && (
        <ol className="term-entry__repeats">
          {entry.results.map((result, index) => (
            <li key={index}>
              <span>#{index + 1}</span>
              <span className="term-entry__detail">{result.detail}</span>
              <span className="term-entry__order-total">{result.total}</span>
            </li>
          ))}
        </ol>
      )}

      {single && (
        <div ref={rowRef} className="term-entry__roll">
          <div className="term-entry__dice">
            {drawn ? (
              <div ref={artRef} className="term-entry__art">
                {artLayout(drawn).map((item, position) => {
                  if (item.kind === "op") {
                    return (
                      <span key={position} className="term-entry__op">
                        {item.sign}
                      </span>
                    )
                  }
                  if (item.kind === "mod") {
                    return (
                      <pre key={position} className="term-entry__mod">
                        {bigNumber(item.value)}
                      </pre>
                    )
                  }

                  const die = drawn.dice[item.index] as AsciiDie
                  const picture = <pre className={`term-die${die.kept ? "" : " term-die--dropped"}`}>{dieArt(die)}</pre>
                  if (item.index !== naturalIndex) return <Fragment key={position}>{picture}</Fragment>

                  // Тот самый d20 — кнопка: клик повторяет меч с огнём или череп.
                  const replay = natural === "crit" ? t.term.relight : t.term.rattle
                  return (
                    <button
                      key={position}
                      className="term-egg term-entry__natural"
                      onClick={natural === "crit" ? onIgnite : onRattle}
                      aria-label={replay}
                      title={replay}
                    >
                      {picture}
                      {natural === "fumble" && <Skull token={rattleToken} />}
                    </button>
                  )
                })}
              </div>
            ) : (
              <span className="term-entry__detail">{single.detail}</span>
            )}
          </div>
          {/* Меч выезжает слева поверх кубов, пока горит огонь, и уходит вместе
              с ним. Ключ по токену перезапускает анимацию на каждом поджиге. */}
          {natural === "crit" && burnToken ? (
            <div className="term-sword__track" aria-hidden="true">
              <pre key={burnToken} className="term-sword">
                {SWORD}
              </pre>
            </div>
          ) : null}
          <div ref={sumRef} className="term-entry__sum">
            <pre className="term-entry__big">{bigNumber(single.total)}</pre>
          </div>
        </div>
      )}

      <div className="term-entry__actions">
        {!initiative && (
          <>
            <button className="term-btn" onClick={onRepeat} aria-label={t.log.rerollNamed(entry.expression)}>
              [{t.term.again}]
            </button>
            <button className="term-btn" onClick={onSave} aria-label={t.log.saveNamed(entry.expression)}>
              [{t.term.save}]
            </button>
          </>
        )}
      </div>
    </article>
  )
}
