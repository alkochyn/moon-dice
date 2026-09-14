import { useCallback, useEffect, useRef, useState } from "preact/hooks"

import "./styles.css"
import { DiceError, rollFormula } from "./dice"
import { ensureSdk, getCurrentUser, watchLateSdk, type BoardStatus, type BoardUser } from "./board/sdk"
import {
  clearBoardLog,
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
import { Presets, type PresetScope } from "./ui/Presets"
import { RollLog } from "./ui/RollLog"
import { Diagnostics } from "./ui/Diagnostics"

const FORMULA_HISTORY_KEY = "dice.formulas.v1"
const LOCAL_USER_KEY = "dice.localUserId.v1"
const POST_TO_BOARD_KEY = "dice.postToBoard.v1"
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

  const rememberFormula = useCallback((value: string) => {
    setFormulaHistory((prev) => {
      const next = [value, ...prev.filter((item) => item !== value)].slice(0, MAX_FORMULA_HISTORY)
      writeJson(FORMULA_HISTORY_KEY, next)
      return next
    })
  }, [])

  const roll = useCallback(
    (raw: string) => {
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

      const entry: RollEntry = {
        id: newId(),
        ts: Date.now(),
        userId: user?.id ?? anonId.current,
        userName: user?.name ?? "Вы",
        expression: result.expression,
        ...(result.label ? { label: result.label } : {}),
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

  const addPreset = useCallback(
    (name: string, value: string, color: string) => {
      const preset = makePreset(name, value, color)
      if (scope === "mine") {
        savePersonal([...personalRef.current.items, preset])
      } else {
        const next = [...shared, preset]
        setShared(next)
        void writeSharedPresets(next)
      }
    },
    [savePersonal, scope, shared],
  )

  const removePreset = useCallback(
    (id: string) => {
      if (scope === "mine") {
        savePersonal(personalRef.current.items.filter((item) => item.id !== id))
      } else {
        const next = shared.filter((item) => item.id !== id)
        setShared(next)
        void writeSharedPresets(next)
      }
    },
    [savePersonal, scope, shared],
  )

  const clearLog = useCallback(() => {
    setEntries([])
    writeLocalLog([])
    if (statusRef.current === "connected") void clearBoardLog()
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
        onFormulaChange={setFormula}
        onRoll={roll}
        onSaveCurrent={() => {
          setScope("mine")
          if (formula.trim()) addPreset("", formula, "slate")
        }}
      />

      <Presets
        scope={scope}
        onScopeChange={setScope}
        items={scope === "mine" ? personal.items : shared}
        sharedAvailable={status === "connected"}
        draftFormula={formula}
        onRoll={roll}
        onAdd={addPreset}
        onRemove={removePreset}
      />

      <RollLog
        entries={entries}
        currentUserId={user?.id ?? anonId.current}
        onRepeat={(value) => {
          setFormula(value)
          roll(value)
        }}
        onClear={clearLog}
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
