import { useCallback, useEffect, useRef, useState } from "preact/hooks"

import "./styles.css"
import { DiceError, rollFormula } from "./dice"
import { DEFAULT_DICE_SET } from "./data/diceSets"
import { ensureSdk, getCurrentUser, watchLateSdk, type BoardStatus, type BoardUser } from "./board/sdk"
import {
  mergeEntries,
  newId,
  publishEntry,
  readLocalLog,
  subscribeBoardLog,
  writeLocalLog,
  type RollEntry,
} from "./board/log"
import {
  makePreset,
  pushPersonalPresets,
  readLocalPresets,
  readSharedPresets,
  subscribeSharedPresets,
  syncPersonalPresets,
  writeLocalPresets,
  writeSharedPresets,
  type Preset,
  type PresetBox,
} from "./board/presets"
import { postRollToBoard } from "./board/post"
import { StatusBar } from "./ui/StatusBar"
import { RollBar } from "./ui/RollBar"
import { Presets, type PresetDraft, type PresetScope } from "./ui/Presets"
import { RollLog } from "./ui/RollLog"
import { Diagnostics } from "./ui/Diagnostics"

const FORMULA_HISTORY_KEY = "dice.formulas.v1"
const LOCAL_USER_KEY = "dice.localUserId.v1"
const POST_TO_BOARD_KEY = "dice.postToBoard.v1"
const DICE_SET_KEY = "dice.set.v1"
const MAX_FORMULA_HISTORY = 50

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Хранилище может быть недоступно — работаем из памяти.
  }
}

/** Пока доска не отвечает, броски всё равно должны подписываться кем-то стабильным. */
const localUserId = (): string => {
  try {
    const existing = localStorage.getItem(LOCAL_USER_KEY)
    if (existing) return existing

    const id = `local-${newId()}`
    localStorage.setItem(LOCAL_USER_KEY, id)
    return id
  } catch {
    return `local-${newId()}`
  }
}

export const App = () => {
  const [status, setStatus] = useState<BoardStatus>("loading")
  const [user, setUser] = useState<BoardUser | null>(null)
  const [entries, setEntries] = useState<RollEntry[]>([])
  const [formula, setFormula] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [formulaHistory, setFormulaHistory] = useState<string[]>([])
  const [personal, setPersonal] = useState<PresetBox>({ updatedAt: 0, items: [] })
  const [shared, setShared] = useState<Preset[]>([])
  const [scope, setScope] = useState<PresetScope>("mine")
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null)
  const [diceSet, setDiceSet] = useState<string>(DEFAULT_DICE_SET)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [postToBoard, setPostToBoard] = useState(false)

  const statusRef = useRef<BoardStatus>("loading")
  const personalRef = useRef<PresetBox>(personal)
  const postToBoardRef = useRef(false)
  const anonId = useRef<string>("")

  statusRef.current = status
  personalRef.current = personal
  postToBoardRef.current = postToBoard

  // Локальное состояние поднимаем сразу: панель обязана быть рабочей ещё до
  // того, как выяснится, доехал ли SDK.
  useEffect(() => {
    anonId.current = localUserId()
    setEntries(readLocalLog())
    setFormulaHistory(readJson<string[]>(FORMULA_HISTORY_KEY, []))
    setPostToBoard(readJson<boolean>(POST_TO_BOARD_KEY, false))
    setDiceSet(readJson<string>(DICE_SET_KEY, DEFAULT_DICE_SET))

    const local = readLocalPresets()
    setPersonal({ updatedAt: local.updatedAt, items: local.items })
  }, [])

  useEffect(() => {
    let alive = true

    void ensureSdk().then(async (connected) => {
      if (!alive) return
      setStatus(connected ? "connected" : "offline")
      if (connected) setUser(await getCurrentUser())
    })

    const stopWatching = watchLateSdk(() => {
      if (!alive) return
      setStatus("connected")
      void getCurrentUser().then((late) => {
        if (alive) setUser(late)
      })
    })

    return () => {
      alive = false
      stopWatching()
    }
  }, [])

  // Общий журнал и общие пресеты живут в хранилище доски: onValue прилетает
  // всем клиентам, так что лента обновляется у всей партии без своего сервера.
  useEffect(() => {
    if (status !== "connected") return undefined

    const stopLog = subscribeBoardLog((boardEntries) => {
      setEntries((prev) => {
        const merged = mergeEntries(prev, boardEntries)
        writeLocalLog(merged)
        return merged
      })
    })
    const stopPresets = subscribeSharedPresets(setShared)
    void readSharedPresets().then(setShared)

    return () => {
      stopLog()
      stopPresets()
    }
  }, [status])

  useEffect(() => {
    if (status !== "connected" || !user) return
    void syncPersonalPresets(user.id, personalRef.current).then(setPersonal)
  }, [status, user])

  const savePersonal = useCallback(
    (items: Preset[]) => {
      const box: PresetBox = { updatedAt: Date.now(), items }
      setPersonal(box)
      writeLocalPresets(box)
      if (statusRef.current === "connected" && user) void pushPersonalPresets(user.id, box)
    },
    [user],
  )

  const saveShared = useCallback((items: Preset[]) => {
    setShared(items)
    void writeSharedPresets(items)
  }, [])

  const rememberFormula = useCallback((value: string) => {
    setFormulaHistory((prev) => {
      const next = [value, ...prev.filter((item) => item !== value)].slice(0, MAX_FORMULA_HISTORY)
      writeJson(FORMULA_HISTORY_KEY, next)
      return next
    })
  }, [])

  /**
   * presetName — название сохранённого броска. Оно уходит в журнал подписью,
   * чтобы партия видела «Урон основной атакой», а не голую формулу.
   * Метка прямо в формуле (после двоеточия) имеет приоритет: её игрок написал
   * только что и именно для этого броска.
   */
  const roll = useCallback(
    (raw: string, presetName?: string) => {
      const source = raw.trim()
      if (!source) return

      let result
      try {
        result = rollFormula(source)
      } catch (failure) {
        setError(failure instanceof DiceError ? failure.message : "Не удалось разобрать формулу")
        return
      }
      setError(null)

      const label = result.label ?? presetName?.trim()
      const entry: RollEntry = {
        id: newId(),
        ts: Date.now(),
        userId: user?.id ?? anonId.current,
        userName: user?.name ?? "Вы",
        expression: result.expression,
        ...(label ? { label } : {}),
        results: result.rolls.map((item) => ({ total: item.total, detail: item.detail })),
      }

      // Своя запись показывается сразу, не дожидаясь ответа доски.
      setEntries((prev) => {
        const merged = mergeEntries(prev, [entry])
        writeLocalLog(merged)
        return merged
      })
      rememberFormula(source)

      if (statusRef.current === "connected") {
        void publishEntry(entry)
        if (postToBoardRef.current) {
          void postRollToBoard([
            `${entry.userName}${entry.label ? ` · ${entry.label}` : ""}`,
            ...entry.results.map((item) => `${entry.expression} = ${item.total}`),
          ])
        }
      }
    },
    [rememberFormula, user],
  )

  const openDraft = useCallback(() => {
    setPresetDraft({ name: "", formula: formula.trim(), color: "slate" })
  }, [formula])

  const editPreset = useCallback((preset: Preset) => {
    setPresetDraft({ id: preset.id, name: preset.name, formula: preset.formula, color: preset.color })
  }, [])

  const submitDraft = useCallback(() => {
    if (!presetDraft) return

    const formulaValue = presetDraft.formula.trim()
    if (!formulaValue) return
    const name = presetDraft.name.trim() || formulaValue
    const editing = presetDraft.id

    const apply = (items: Preset[]): Preset[] =>
      editing
        ? items.map((item) =>
            item.id === editing ? { ...item, name, formula: formulaValue, color: presetDraft.color } : item,
          )
        : [...items, makePreset(name, formulaValue, presetDraft.color)]

    if (scope === "mine") savePersonal(apply(personalRef.current.items))
    else saveShared(apply(shared))

    setPresetDraft(null)
  }, [presetDraft, savePersonal, saveShared, scope, shared])

  const removePreset = useCallback(
    (id: string) => {
      if (scope === "mine") savePersonal(personalRef.current.items.filter((item) => item.id !== id))
      else saveShared(shared.filter((item) => item.id !== id))
      setPresetDraft((draft) => (draft?.id === id ? null : draft))
    },
    [savePersonal, saveShared, scope, shared],
  )

  const changeDiceSet = useCallback((id: string) => {
    setDiceSet(id)
    writeJson(DICE_SET_KEY, id)
  }, [])

  const togglePostToBoard = useCallback((next: boolean) => {
    setPostToBoard(next)
    writeJson(POST_TO_BOARD_KEY, next)
  }, [])

  return (
    <div className="app">
      <StatusBar
        status={status}
        {...(user ? { userName: user.name } : {})}
        diagnosticsOpen={diagnosticsOpen}
        onToggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
      />

      {diagnosticsOpen && <Diagnostics status={status} />}

      <RollBar
        formula={formula}
        error={error}
        formulaHistory={formulaHistory}
        diceSet={diceSet}
        onDiceSetChange={changeDiceSet}
        onFormulaChange={setFormula}
        onRoll={roll}
        onSaveCurrent={() => {
          setScope("mine")
          openDraft()
        }}
      />

      <Presets
        scope={scope}
        onScopeChange={setScope}
        items={scope === "mine" ? personal.items : shared}
        sharedAvailable={status === "connected"}
        draft={presetDraft}
        onDraftChange={setPresetDraft}
        onDraftSubmit={submitDraft}
        onOpenDraft={openDraft}
        onEdit={editPreset}
        onRoll={(preset) => roll(preset.formula, preset.name)}
        onRemove={removePreset}
      />

      <RollLog
        entries={entries}
        currentUserId={user?.id ?? anonId.current}
        onRepeat={(value) => {
          setFormula(value)
          roll(value)
        }}
      />

      <label className="checkbox">
        <input
          type="checkbox"
          checked={postToBoard}
          disabled={status !== "connected"}
          onChange={(event) => togglePostToBoard((event.target as HTMLInputElement).checked)}
        />
        дублировать броски стикером на доску
      </label>
    </div>
  )
}
