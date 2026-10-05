import { useCallback, useEffect, useRef, useState } from "preact/hooks"

import { readOnlineUsers, readProfile } from "../board/players"
import { newId } from "../board/log"
import { DEFAULT_INITIATIVE, expandMonster, type Combatant } from "../combat/initiative"
import { DiceError, parseFormula, validateFormula } from "../dice"
import { describeDiceError, useT } from "../i18n"
import { Avatar } from "./Avatar"
import { HelpIcon, SwordsIcon } from "./icons"

const MONSTERS_KEY = "dice.combat.monsters.v1"
/** Формулы, вписанные мастером игрокам, и галочки участия — по userId. */
const OVERRIDES_KEY = "dice.combat.overrides.v1"
const INCLUDED_KEY = "dice.combat.included.v1"
/** Имена, которые мастер дал игрокам в бою, — по userId. */
const NAMES_KEY = "dice.combat.names.v1"
/** Последнее, что мастер видел у каждого игрока на доске: чтобы ушедший не пропадал из списка. */
const ROSTER_KEY = "dice.combat.roster.v1"
/** Как часто перечитываем, кто на доске, пока вкладка открыта. */
const REFRESH_MS = 5000

/** Строка монстра хранится как есть — `3#1d20+1 : Гоблин`, — с галочкой участия. */
interface MonsterItem {
  id: string
  source: string
  on: boolean
}

/** Карточка игрока, какой мастер её видел в последний раз. */
interface Known {
  name: string
  icon?: string
  color?: string
  initiative: string
}

interface PlayerRow extends Known {
  userId: string
  online: boolean
}

interface Props {
  connected: boolean
  /** Сам мастер в списке не нужен: за себя он заводит монстров руками. */
  selfId: string
  onRoll: (combatants: Combatant[]) => void
}

const readMonsters = (): MonsterItem[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MONSTERS_KEY) ?? "[]")
    return Array.isArray(parsed) ? (parsed as MonsterItem[]).filter((item) => typeof item?.source === "string") : []
  } catch {
    return []
  }
}

const writeStored = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Значение останется в памяти до конца сессии.
  }
}

/** Словарь по userId; всё, что не проходит проверку, молча отбрасываем. */
const readRecord = <T,>(key: string, valid: (value: unknown) => boolean): Record<string, T> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}")
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => valid(value))) as Record<string, T>
  } catch {
    return {}
  }
}

const isString = (value: unknown): boolean => typeof value === "string"
const isBoolean = (value: unknown): boolean => typeof value === "boolean"
const isKnown = (value: unknown): boolean =>
  Boolean(value) && isString((value as Known).name) && isString((value as Known).initiative)

/**
 * Пустую правку не храним: стёртое поле после перезагрузки снова покажет
 * то, что игрок вписал себе сам, а не залипнет пустым навсегда.
 */
const writeEdits = (key: string, edits: Record<string, string>): void =>
  writeStored(key, Object.fromEntries(Object.entries(edits).filter(([, value]) => value.trim())))

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _removed, ...rest } = record
  return rest
}

/**
 * Вкладка мастера. Игроки — все, кто на доске, со своими формулами из
 * настроек, плюс ушедшие, если у них есть формула или имя: игрок мог просто
 * выпасть из Miro, а в бою он остаётся. Монстры — список мастера. Одна кнопка
 * кидает за всех и отдаёт порядок в общий журнал.
 *
 * Имя и формулу игрока здесь можно поправить (не вписал свою, сработала
 * способность, в Miro он под ником) — в его настройки правка не уходит, но у
 * мастера запоминается вместе с галочками участия: кидают часто, а состав и
 * формулы почти не меняются.
 */
export const Combat = ({ connected, selfId, onRoll }: Props) => {
  const t = useT()
  const [roster, setRoster] = useState<Record<string, Known>>(() => readRecord(ROSTER_KEY, isKnown))
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set())
  const [onlineFailed, setOnlineFailed] = useState(false)
  const [included, setIncluded] = useState<Record<string, boolean>>(() => readRecord(INCLUDED_KEY, isBoolean))
  const [overrides, setOverrides] = useState<Record<string, string>>(() => readRecord(OVERRIDES_KEY, isString))
  const [names, setNames] = useState<Record<string, string>>(() => readRecord(NAMES_KEY, isString))
  const [monsters, setMonsters] = useState<MonsterItem[]>(readMonsters)
  const [draft, setDraft] = useState("")
  const [hintOpen, setHintOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rosterRef = useRef(roster)
  rosterRef.current = roster

  const saveRoster = (next: Record<string, Known>): void => {
    setRoster(next)
    writeStored(ROSTER_KEY, next)
  }

  const load = useCallback(async () => {
    if (!connected) return

    const online = await readOnlineUsers()
    if (!online) {
      setOnlineFailed(true)
      return
    }

    // Ушедших тоже перечитываем: игрок мог поправить формулу, пока его не было.
    const onlineNames = new Map(online.map((user) => [user.id, user.name]))
    const ids = [...new Set([...onlineNames.keys(), ...Object.keys(rosterRef.current)])].filter((id) => id !== selfId)
    const profiles = await Promise.all(ids.map((id) => readProfile(id)))

    const next = { ...rosterRef.current }
    ids.forEach((id, index) => {
      const profile = profiles[index]
      const known = next[id]
      const name = profile?.name || onlineNames.get(id) || known?.name
      if (!name) return
      next[id] = {
        name,
        ...(profile?.icon ? { icon: profile.icon } : known?.icon ? { icon: known.icon } : {}),
        ...(profile?.color ? { color: profile.color } : known?.color ? { color: known.color } : {}),
        initiative: profile?.initiative ?? known?.initiative ?? "",
      }
    })

    setOnlineFailed(false)
    setOnlineIds(new Set(onlineNames.keys()))
    if (JSON.stringify(next) !== JSON.stringify(rosterRef.current)) saveRoster(next)
  }, [connected, selfId])

  useEffect(() => {
    void load()
    if (!connected) return undefined

    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [connected, load])

  const formulaOf = (row: PlayerRow): string => overrides[row.userId] ?? row.initiative
  const nameOf = (row: PlayerRow): string => names[row.userId] ?? row.name
  const displayName = (row: PlayerRow): string => nameOf(row).trim() || row.name
  // Пока мастер не трогал галочку, в бою те, у кого вписана формула: зрители её
  // обычно не заводят.
  const isIncluded = (row: PlayerRow): boolean => included[row.userId] ?? Boolean(formulaOf(row).trim())

  // Ушедший остаётся, только если про него есть что помнить: формула или имя.
  // Зритель без формулы, закрывший доску, из списка уходит.
  const players: PlayerRow[] = Object.entries(roster)
    .filter(([userId]) => userId !== selfId)
    .map(([userId, known]) => ({ ...known, userId, online: onlineIds.has(userId) }))
    .filter((row) => row.online || formulaOf(row).trim() !== "" || Boolean(names[row.userId]?.trim()))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))

  const saveMonsters = (next: MonsterItem[]): void => {
    setMonsters(next)
    writeStored(MONSTERS_KEY, next)
  }

  const setOverride = (userId: string, formula: string): void => {
    const next = { ...overrides, [userId]: formula }
    setOverrides(next)
    writeEdits(OVERRIDES_KEY, next)
  }

  const setName = (userId: string, name: string): void => {
    const next = { ...names, [userId]: name }
    setNames(next)
    writeEdits(NAMES_KEY, next)
  }

  const setIncludedFor = (userId: string, on: boolean): void => {
    const next = { ...included, [userId]: on }
    setIncluded(next)
    writeStored(INCLUDED_KEY, next)
  }

  /** Забыть ушедшего игрока целиком — вместе с правками мастера. */
  const forget = (userId: string): void => {
    saveRoster(without(roster, userId))
    const nextOverrides = without(overrides, userId)
    setOverrides(nextOverrides)
    writeEdits(OVERRIDES_KEY, nextOverrides)
    const nextNames = without(names, userId)
    setNames(nextNames)
    writeEdits(NAMES_KEY, nextNames)
    const nextIncluded = without(included, userId)
    setIncluded(nextIncluded)
    writeStored(INCLUDED_KEY, nextIncluded)
  }

  const monsterValid = (source: string): boolean => {
    try {
      expandMonster(source, t.combat.monster)
      return true
    } catch {
      return false
    }
  }

  const addMonster = (): void => {
    const source = draft.trim()
    if (!source) return

    try {
      expandMonster(source, t.combat.monster)
    } catch (failure) {
      setError(failure instanceof DiceError ? describeDiceError(t, failure) : t.errors.parseFailed)
      return
    }

    setError(null)
    saveMonsters([...monsters, { id: newId(), source, on: true }])
    setDraft("")
  }

  const roll = (): void => {
    const combatants: Combatant[] = []
    let current = ""

    try {
      for (const row of players) {
        if (!isIncluded(row)) continue
        current = displayName(row)
        const formula = formulaOf(row).trim() || DEFAULT_INITIATIVE
        parseFormula(formula)
        combatants.push({
          name: displayName(row),
          formula,
          npc: false,
          userId: row.userId,
          ...(row.icon ? { icon: row.icon } : {}),
          ...(row.color ? { color: row.color } : {}),
        })
      }

      for (const monster of monsters) {
        if (!monster.on) continue
        current = monster.source
        combatants.push(...expandMonster(monster.source, t.combat.monster))
      }
    } catch (failure) {
      const message = failure instanceof DiceError ? describeDiceError(t, failure) : t.errors.parseFailed
      setError(t.errors.presetPrefix(current, message))
      return
    }

    if (combatants.length === 0) {
      setError(t.combat.nobody)
      return
    }

    setError(null)
    onRoll(combatants)
  }

  return (
    <div className="combat">
      <div className="combat__list">
        <div className="combat__head">
          <span>{t.combat.players}</span>
          <span className="section__spacer" />
          {connected && (
            <button className="btn btn--ghost" onClick={() => void load()}>
              {t.combat.refresh}
            </button>
          )}
        </div>

        {players.map((row) => {
          const formula = formulaOf(row)
          const invalid = formula.trim() !== "" && !validateFormula(formula).ok
          const shown = displayName(row)

          return (
            <div
              key={row.userId}
              className={`combat__row${row.online ? "" : " combat__row--away"}`}
              title={row.online ? undefined : t.combat.away}
            >
              <input
                type="checkbox"
                checked={isIncluded(row)}
                aria-label={t.combat.include(shown)}
                onChange={(event) => setIncludedFor(row.userId, (event.target as HTMLInputElement).checked)}
              />
              <Avatar
                name={shown}
                userId={row.userId}
                {...(row.icon ? { icon: row.icon } : {})}
                {...(row.color ? { color: row.color } : {})}
              />
              <input
                className="combat__name"
                type="text"
                autocomplete="off"
                spellcheck={false}
                placeholder={row.name}
                aria-label={t.combat.nameFor(row.name)}
                title={t.combat.editable}
                value={nameOf(row)}
                onInput={(event) => setName(row.userId, (event.target as HTMLInputElement).value)}
              />
              <input
                className={`input input--compact combat__formula${invalid ? " input--invalid" : ""}`}
                type="text"
                autocomplete="off"
                spellcheck={false}
                placeholder={DEFAULT_INITIATIVE}
                aria-label={t.combat.formulaFor(shown)}
                value={formula}
                onInput={(event) => setOverride(row.userId, (event.target as HTMLInputElement).value)}
              />
              {!row.online && (
                <button
                  className="btn btn--ghost btn--icon"
                  onClick={() => forget(row.userId)}
                  aria-label={t.combat.removeMonster(shown)}
                  title={t.combat.removeMonster(shown)}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

        {!connected && <p className="combat__hint">{t.combat.offline}</p>}
        {connected && onlineFailed && <p className="combat__hint">{t.combat.onlineFailed}</p>}
        {connected && !onlineFailed && players.length === 0 && <p className="combat__hint">{t.combat.empty}</p>}

        <div className="combat__head">
          <span>{t.combat.monsters}</span>
        </div>

        {monsters.map((monster) => (
          <div key={monster.id} className="combat__row">
            <input
              type="checkbox"
              checked={monster.on}
              aria-label={t.combat.include(monster.source)}
              onChange={(event) =>
                saveMonsters(
                  monsters.map((item) =>
                    item.id === monster.id ? { ...item, on: (event.target as HTMLInputElement).checked } : item,
                  ),
                )
              }
            />
            <input
              className={`combat__name combat__monster${monsterValid(monster.source) ? "" : " combat__name--invalid"}`}
              type="text"
              autocomplete="off"
              spellcheck={false}
              aria-label={t.combat.monsters}
              title={t.combat.editable}
              value={monster.source}
              onInput={(event) =>
                saveMonsters(
                  monsters.map((item) =>
                    item.id === monster.id ? { ...item, source: (event.target as HTMLInputElement).value } : item,
                  ),
                )
              }
            />
            <button
              className="btn btn--ghost btn--icon"
              onClick={() => saveMonsters(monsters.filter((item) => item.id !== monster.id))}
              aria-label={t.combat.removeMonster(monster.source)}
              title={t.combat.removeMonster(monster.source)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="combat__footer">
        <div className="combat__add">
          <input
            className="input input--compact"
            type="text"
            autocomplete="off"
            spellcheck={false}
            placeholder={t.combat.monsterPlaceholder}
            aria-label={t.combat.monsters}
            value={draft}
            onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => event.key === "Enter" && addMonster()}
          />
          <button className="btn btn--compact" onClick={addMonster}>
            {t.combat.addMonster}
          </button>
          <button
            className="btn btn--ghost btn--icon combat__help"
            onClick={() => setHintOpen((open) => !open)}
            aria-expanded={hintOpen}
            aria-label={t.combat.monsterHelp}
            title={t.combat.monsterHint}
          >
            <HelpIcon />
          </button>
        </div>
        {hintOpen && <p className="combat__hint">{t.combat.monsterHint}</p>}

        {error && <div className="error">{error}</div>}

        <button className="btn btn--primary combat__roll" onClick={roll}>
          <SwordsIcon />
          {t.combat.roll}
        </button>
      </div>
    </div>
  )
}
