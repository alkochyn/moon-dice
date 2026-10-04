import { useCallback, useEffect, useState } from "preact/hooks"

import { readOnlineUsers, readProfile } from "../board/players"
import { newId } from "../board/log"
import { DEFAULT_INITIATIVE, expandMonster, type Combatant } from "../combat/initiative"
import { DiceError, parseFormula, validateFormula } from "../dice"
import { describeDiceError, useT } from "../i18n"
import { Avatar } from "./Avatar"
import { SwordsIcon } from "./icons"

const MONSTERS_KEY = "dice.combat.monsters.v1"
/** Формулы, вписанные мастером игрокам, и галочки участия — по userId. */
const OVERRIDES_KEY = "dice.combat.overrides.v1"
const INCLUDED_KEY = "dice.combat.included.v1"
/** Как часто перечитываем, кто на доске, пока вкладка открыта. */
const REFRESH_MS = 5000

/** Строка монстра хранится как есть — `3#1d20+1 : Гоблин`, — с галочкой участия. */
interface MonsterItem {
  id: string
  source: string
  on: boolean
}

interface PlayerRow {
  userId: string
  name: string
  icon?: string
  color?: string
  initiative: string
}

interface Props {
  connected: boolean
  /** Свои данные берём из панели, а не с доски: только что сохранённые
   *  настройки могли туда ещё не доехать. */
  self: Required<PlayerRow>
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

/** Словарь по userId; всё, что не того типа, молча отбрасываем. */
const readRecord = <T extends string | boolean>(key: string, type: "string" | "boolean"): Record<string, T> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}")
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === type)) as Record<string, T>
  } catch {
    return {}
  }
}

/**
 * Пустую правку не храним: стёртое поле после перезагрузки снова покажет
 * формулу из настроек игрока, а не залипнет пустым навсегда.
 */
const writeOverrides = (overrides: Record<string, string>): void =>
  writeStored(OVERRIDES_KEY, Object.fromEntries(Object.entries(overrides).filter(([, value]) => value.trim())))

/**
 * Вкладка мастера. Игроки — все, кто сейчас на доске, со своими формулами из
 * настроек; монстры — список мастера, он живёт в его браузере между боями.
 * Одна кнопка кидает за всех и отдаёт порядок в общий журнал.
 *
 * Формулу игрока здесь можно поправить (не вписал свою, сработала
 * способность) — в его настройки правка не уходит, но у мастера запоминается
 * вместе с галочками участия: кидают часто, а состав и формулы почти не
 * меняются.
 */
export const Combat = ({ connected, self, onRoll }: Props) => {
  const t = useT()
  const [rows, setRows] = useState<PlayerRow[]>([])
  const [onlineFailed, setOnlineFailed] = useState(false)
  const [included, setIncluded] = useState<Record<string, boolean>>(() => readRecord(INCLUDED_KEY, "boolean"))
  const [overrides, setOverrides] = useState<Record<string, string>>(() => readRecord(OVERRIDES_KEY, "string"))
  const [monsters, setMonsters] = useState<MonsterItem[]>(readMonsters)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!connected) return

    const online = await readOnlineUsers()
    if (!online) {
      setOnlineFailed(true)
      return
    }

    const profiles = await Promise.all(online.map((user) => readProfile(user.id)))
    setOnlineFailed(false)
    setRows(
      online.map((user, index) => {
        const profile = profiles[index]
        return {
          userId: user.id,
          name: profile?.name || user.name,
          ...(profile?.icon ? { icon: profile.icon } : {}),
          ...(profile?.color ? { color: profile.color } : {}),
          initiative: profile?.initiative ?? "",
        }
      }),
    )
  }, [connected])

  useEffect(() => {
    void load()
    if (!connected) return undefined

    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [connected, load])

  // Себя показываем первым и всегда — даже без доски мастер может играть и
  // за персонажа, а остальных выстраиваем по имени.
  const players: PlayerRow[] = [
    self,
    ...rows.filter((row) => row.userId !== self.userId).sort((a, b) => a.name.localeCompare(b.name)),
  ]

  const formulaOf = (row: PlayerRow): string => overrides[row.userId] ?? row.initiative
  // Пока мастер не трогал галочку, в бою те, у кого вписана формула: зрители и
  // сам мастер её обычно не заводят.
  const isIncluded = (row: PlayerRow): boolean => included[row.userId] ?? Boolean(formulaOf(row).trim())

  const saveMonsters = (next: MonsterItem[]): void => {
    setMonsters(next)
    writeStored(MONSTERS_KEY, next)
  }

  const setOverride = (userId: string, formula: string): void => {
    const next = { ...overrides, [userId]: formula }
    setOverrides(next)
    writeOverrides(next)
  }

  const setIncludedFor = (userId: string, on: boolean): void => {
    const next = { ...included, [userId]: on }
    setIncluded(next)
    writeStored(INCLUDED_KEY, next)
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
        current = row.name
        const formula = formulaOf(row).trim() || DEFAULT_INITIATIVE
        parseFormula(formula)
        combatants.push({
          name: row.name,
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

        return (
          <label key={row.userId} className="combat__row">
            <input
              type="checkbox"
              checked={isIncluded(row)}
              onChange={(event) => setIncludedFor(row.userId, (event.target as HTMLInputElement).checked)}
            />
            <Avatar
              name={row.name}
              userId={row.userId}
              {...(row.icon ? { icon: row.icon } : {})}
              {...(row.color ? { color: row.color } : {})}
            />
            <span className="combat__name">
              {row.name}
              {row.userId === self.userId && <span className="combat__you"> · {t.combat.you}</span>}
            </span>
            <input
              className={`input input--compact combat__formula${invalid ? " input--invalid" : ""}`}
              type="text"
              autocomplete="off"
              spellcheck={false}
              placeholder={DEFAULT_INITIATIVE}
              aria-label={t.combat.formulaFor(row.name)}
              value={formula}
              onInput={(event) => setOverride(row.userId, (event.target as HTMLInputElement).value)}
            />
          </label>
        )
      })}

      {!connected && <p className="combat__hint">{t.combat.offline}</p>}
      {connected && onlineFailed && <p className="combat__hint">{t.combat.onlineFailed}</p>}

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
          <span className="combat__monster">{monster.source}</span>
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
      </div>
      <p className="combat__hint">{t.combat.monsterHint}</p>

      {error && <div className="error">{error}</div>}

      <button className="btn btn--primary combat__roll" onClick={roll}>
        <SwordsIcon />
        {t.combat.roll}
      </button>
    </div>
  )
}
