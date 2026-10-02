import { useCallback, useEffect, useRef, useState } from "preact/hooks"

import "./styles.css"
import { DiceError, parseFormula, rollFormula } from "./dice"
import { DEFAULT_LANG, LangContext, STRINGS, describeDiceError, isLang, type Lang } from "./i18n"
import { DEFAULT_DICE_SET } from "./data/diceSets"
import { ensureSdk, getCurrentUser, watchLateSdk, type BoardStatus, type BoardUser } from "./board/sdk"
import {
  mergeEntries,
  newId,
  nextEntries,
  publishEntry,
  readBoardLog,
  readLocalLog,
  subscribeBoardLog,
  writeLocalLog,
  type RollEntry,
} from "./board/log"
import {
  defaultPresets,
  makePreset,
  pushPersonalPresets,
  reorderPresets,
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
import { publishProfile } from "./board/players"
import { rollInitiative, type Combatant } from "./combat/initiative"
import { StatusBar } from "./ui/StatusBar"
import { DiceBar } from "./ui/DiceBar"
import { PlayerBar } from "./ui/PlayerBar"
import { FormulaBar } from "./ui/FormulaBar"
import { Presets, type PresetDraft, type PresetScope } from "./ui/Presets"
import { PanelTabs, type Panel } from "./ui/PanelTabs"
import { RollLog } from "./ui/RollLog"
import { PlayerSettings, type PlayerLook } from "./ui/PlayerSettings"
import { Help } from "./ui/Help"
import { Combat } from "./ui/Combat"
import { defaultColor, defaultIconId } from "./utils/avatar"
import { DEFAULT_SKIN, isSkin, type Skin } from "./skins"
import { Terminal } from "./skins/terminal/Terminal"

const FORMULA_HISTORY_KEY = "dice.formulas.v1"
const LOCAL_USER_KEY = "dice.localUserId.v1"
const POST_TO_BOARD_KEY = "dice.postToBoard.v1"
const DICE_SET_KEY = "dice.set.v1"
const DICE_COLLAPSED_KEY = "dice.collapsed.v1"
const PANEL_KEY = "dice.panel.v1"
const CHARACTER_KEY = "dice.character.v1"
const LOOK_KEY = "dice.look.v1"
const INITIATIVE_KEY = "dice.initiative.v1"
const LANG_KEY = "dice.lang.v1"
const SKIN_KEY = "dice.skin.v1"
const MAX_FORMULA_HISTORY = 50
/** Как часто перечитываем журнал доски, пока подписка ненадёжна. */
const POLL_INTERVAL_MS = 4000

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

/**
 * Язык читаем сразу, ещё до первой отрисовки, иначе панель мигнула бы чужим
 * языком. Если игрок ещё не выбирал, берём язык браузера: своя русская партия
 * так и остаётся на русском, остальные получают английский.
 */
const initialLang = (): Lang => {
  const saved = readJson<unknown>(LANG_KEY, null)
  if (isLang(saved)) return saved
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : DEFAULT_LANG
}

/** Облик тоже читаем до первой отрисовки: иначе терминал мигал бы обычной панелью. */
const initialSkin = (): Skin => {
  const saved = readJson<unknown>(SKIN_KEY, DEFAULT_SKIN)
  return isSkin(saved) ? saved : DEFAULT_SKIN
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
  const [shareError, setShareError] = useState<string | null>(null)
  const [formulaHistory, setFormulaHistory] = useState<string[]>([])
  const [personal, setPersonal] = useState<PresetBox>({ updatedAt: 0, items: [] })
  const [shared, setShared] = useState<Preset[]>([])
  const [panel, setPanel] = useState<Panel>("dice")
  // Куда сохраняет кнопка у поля: в «Общие», только если открыты именно они,
  // иначе — в свои. С вкладки кубов бросок уходит в «Мои».
  const scope: PresetScope = panel === "shared" ? "shared" : "mine"
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null)
  const [diceSet, setDiceSet] = useState<string>(DEFAULT_DICE_SET)
  const [diceCollapsed, setDiceCollapsed] = useState(false)
  const [postToBoard, setPostToBoard] = useState(false)
  const [character, setCharacter] = useState("")
  const [look, setLook] = useState<{ icon?: string; color?: string }>({})
  const [initiative, setInitiative] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [lang, setLang] = useState<Lang>(initialLang)
  const [skin, setSkin] = useState<Skin>(initialSkin)
  const t = STRINGS[lang]

  const changePanel = useCallback((next: Panel) => {
    setPanel(next)
    writeJson(PANEL_KEY, next)
    // Правка чипа живёт в окошке у чипа; уходя с вкладки, закрываем её.
    setPresetDraft(null)
  }, [])

  const statusRef = useRef<BoardStatus>("loading")
  const personalRef = useRef<PresetBox>(personal)
  const postToBoardRef = useRef(false)
  const anonId = useRef<string>("")
  const characterRef = useRef("")
  const lookRef = useRef<{ icon: string; color: string }>({ icon: "", color: "" })
  const tRef = useRef(t)

  const playerId = user?.id ?? anonId.current
  // Пока игрок не выбрал внешность, она выводится из его id: у каждого сразу
  // свой значок, одинаковый у всех, кто смотрит журнал.
  const playerIcon = look.icon ?? defaultIconId(playerId)
  const playerColor = look.color ?? defaultColor(playerId)

  statusRef.current = status
  personalRef.current = personal
  postToBoardRef.current = postToBoard
  characterRef.current = character
  lookRef.current = { icon: playerIcon, color: playerColor }
  tRef.current = t

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Локальное состояние поднимаем сразу: панель обязана быть рабочей ещё до
  // того, как выяснится, доехал ли SDK.
  useEffect(() => {
    anonId.current = localUserId()
    setEntries(readLocalLog())
    setFormulaHistory(readJson<string[]>(FORMULA_HISTORY_KEY, []))
    setPostToBoard(readJson<boolean>(POST_TO_BOARD_KEY, false))
    setDiceSet(readJson<string>(DICE_SET_KEY, DEFAULT_DICE_SET))
    setDiceCollapsed(readJson<boolean>(DICE_COLLAPSED_KEY, false))
    const savedPanel = readJson<unknown>(PANEL_KEY, "dice")
    if (savedPanel === "dice" || savedPanel === "mine" || savedPanel === "shared" || savedPanel === "combat") {
      setPanel(savedPanel)
    }
    setCharacter(readJson<string>(CHARACTER_KEY, ""))
    setLook(readJson<{ icon?: string; color?: string }>(LOOK_KEY, {}))
    setInitiative(readJson<string>(INITIATIVE_KEY, ""))

    const local = readLocalPresets(tRef.current.defaultPresets)
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

  const applyBoardEntries = useCallback((boardEntries: RollEntry[]) => {
    setEntries((prev) => {
      const merged = nextEntries(prev, boardEntries)
      if (merged !== prev) writeLocalLog(merged)

      return merged
    })
  }, [])

  // Общий журнал и общие пресеты живут в хранилище доски. По документации
  // onValue прилетает всем клиентам сразу, но на живой доске чужие броски
  // доезжали только после перезагрузки панели. Поэтому подписка осталась —
  // когда она работает, обновление мгновенное, — но рядом с ней идёт опрос:
  // общая история слишком важна, чтобы держаться на одном механизме.
  useEffect(() => {
    if (status !== "connected") return undefined

    const stopLog = subscribeBoardLog(
      applyBoardEntries,
      (message) => setShareError(tRef.current.errors.logSubscribe(message)),
    )
    const stopPresets = subscribeSharedPresets(setShared)
    void readSharedPresets().then(setShared)

    const poll = setInterval(() => {
      // В скрытом кадре (фоновый экземпляр приложения, свёрнутая панель)
      // опрашивать доску незачем.
      if (document.hidden) return
      void readBoardLog().then(applyBoardEntries)
      void readSharedPresets().then(setShared)
    }, POLL_INTERVAL_MS)

    return () => {
      stopLog()
      stopPresets()
      clearInterval(poll)
    }
  }, [applyBoardEntries, status])

  useEffect(() => {
    if (status !== "connected" || !user) return
    void syncPersonalPresets(user.id, personalRef.current).then(setPersonal)
  }, [status, user])

  // Карточка игрока на доске — по ней мастер кидает инициативу за всех.
  // Пишем при входе и после каждой правки настроек; ключ у игрока свой.
  const profileName = character || user?.name || ""
  useEffect(() => {
    if (status !== "connected" || !user) return
    void publishProfile(user.id, {
      updatedAt: Date.now(),
      name: profileName,
      icon: playerIcon,
      color: playerColor,
      initiative,
    })
  }, [status, user, profileName, playerIcon, playerColor, initiative])

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
   * Запись в журнал: у себя сразу, на доску следом. lines — текст стикера,
   * если игрок включил дублирование бросков на доску.
   */
  const publish = useCallback((entry: RollEntry, lines: string[]) => {
    // Своя запись показывается сразу, не дожидаясь ответа доски.
    setEntries((prev) => {
      const merged = mergeEntries(prev, [entry])
      writeLocalLog(merged)
      return merged
    })

    if (statusRef.current !== "connected") return

    // Общий журнал — смысл всей панели, поэтому неудачная публикация
    // обязана быть видна игроку, а не теряться в молчаливом ретрае.
    void publishEntry(entry).then((published) => {
      setShareError(published ? null : tRef.current.errors.publishFailed)
    })
    if (postToBoardRef.current) void postRollToBoard(lines)
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
        const strings = tRef.current
        const message = failure instanceof DiceError ? describeDiceError(strings, failure) : strings.errors.parseFailed
        // Без имени пресета ошибка висит под полем ввода и выглядит так, будто
        // сломано то, что игрок печатал, а не то, по чему он кликнул.
        setError(presetName ? strings.errors.presetPrefix(presetName, message) : message)
        return
      }
      setError(null)

      const label = result.label ?? presetName?.trim()
      const entry: RollEntry = {
        id: newId(),
        ts: Date.now(),
        userId: user?.id ?? anonId.current,
        userName: characterRef.current || user?.name || tRef.current.player.fallbackName,
        icon: lookRef.current.icon,
        color: lookRef.current.color,
        expression: result.expression,
        ...(label ? { label } : {}),
        results: result.rolls.map((item) => ({ total: item.total, detail: item.detail })),
      }

      rememberFormula(source)
      publish(entry, [
        `${entry.userName}${entry.label ? ` · ${entry.label}` : ""}`,
        ...entry.results.map((item) => `${entry.expression} = ${item.total}`),
      ])
    },
    [publish, rememberFormula, user],
  )

  /**
   * Инициатива за всех одной записью: результаты уже в порядке ходов, у
   * каждого подпись персонажа. Формулы проверила вкладка боя, так что разбор
   * здесь не падает.
   */
  const rollCombat = useCallback(
    (combatants: Combatant[]) => {
      const order = rollInitiative(combatants)
      const strings = tRef.current
      const entry: RollEntry = {
        id: newId(),
        ts: Date.now(),
        userId: user?.id ?? anonId.current,
        userName: characterRef.current || user?.name || strings.player.fallbackName,
        icon: lookRef.current.icon,
        color: lookRef.current.color,
        kind: "initiative",
        // Старая панель (из кэша у кого-то из партии) не знает про kind и
        // покажет обычные плитки — пусть хоть заголовок у них будет понятный.
        expression: strings.combat.title,
        label: strings.combat.title,
        results: order,
      }

      publish(entry, [
        strings.combat.title,
        ...order.map((item, index) => `${index + 1}. ${item.name} — ${item.total}`),
      ])
    },
    [publish, user],
  )

  /** Собирает строку формы из сохранённого броска: формула плюс метка. */
  const toSource = (expression: string, label?: string): string =>
    label ? `${expression} : ${label}` : expression

  /**
   * Звёздочка сохраняет сразу, без формы: цвет и название можно поправить
   * потом карандашом. Повторный клик по той же формуле ничего не добавляет —
   * иначе список забивался бы копиями от случайных нажатий.
   */
  const savePresetNow = useCallback(
    (source: string) => {
      const trimmed = source.trim()
      if (!trimmed) return

      let parsed
      try {
        parsed = parseFormula(trimmed)
      } catch (failure) {
        setError(
          failure instanceof DiceError ? describeDiceError(tRef.current, failure) : tRef.current.errors.parseFailed,
        )
        return
      }

      // Бросок уходит в открытую вкладку: на «Общие» сразу всей партии.
      if (scope === "shared" && statusRef.current !== "connected") {
        setError(tRef.current.errors.sharedOffline)
        return
      }

      setError(null)
      const name = parsed.label ?? ""
      const items = scope === "mine" ? personalRef.current.items : shared
      if (items.some((item) => item.formula === parsed.expression && item.name === name)) return

      const next = [...items, makePreset(name, parsed.expression, "slate")]
      if (scope === "mine") savePersonal(next)
      else saveShared(next)
      // Сохранили с вкладки кубов — показываем, куда бросок лёг.
      if (panel === "dice") changePanel("mine")
    },
    [panel, savePersonal, saveShared, scope, shared],
  )

  /** Звёздочка на карточке броска: сохраняем его формулу вместе с названием. */
  const savePresetFromEntry = useCallback(
    (entry: RollEntry) => savePresetNow(toSource(entry.expression, entry.label)),
    [savePresetNow],
  )

  const editPreset = useCallback((preset: Preset) => {
    setPresetDraft({ id: preset.id, formula: toSource(preset.formula, preset.name), color: preset.color })
  }, [])

  const submitDraft = useCallback(() => {
    if (!presetDraft) return

    // Название живёт в самой формуле после двоеточия — разбираем и раскладываем
    // по полям хранения, чтобы чип и подпись в журнале остались прежними.
    let parsed
    try {
      parsed = parseFormula(presetDraft.formula)
    } catch {
      return
    }

    const formulaValue = parsed.expression
    const name = parsed.label ?? ""
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

  const savePlayerLook = useCallback((next: PlayerLook) => {
    setCharacter(next.character)
    writeJson(CHARACTER_KEY, next.character)
    setInitiative(next.initiative)
    writeJson(INITIATIVE_KEY, next.initiative)

    const appearance = { icon: next.icon, color: next.color }
    setLook(appearance)
    writeJson(LOOK_KEY, appearance)
  }, [])

  const reorderPreset = useCallback(
    (sourceId: string, index: number) => {
      if (scope === "mine") savePersonal(reorderPresets(personalRef.current.items, sourceId, index))
      else saveShared(reorderPresets(shared, sourceId, index))
    },
    [savePersonal, saveShared, scope, shared],
  )

  const changeDiceSet = useCallback((id: string) => {
    setDiceSet(id)
    writeJson(DICE_SET_KEY, id)
  }, [])

  const changeLang = useCallback((next: Lang) => {
    setLang(next)
    writeJson(LANG_KEY, next)
    // Нетронутый стартовый набор нигде не записан — переводим и его, иначе
    // после смены языка в панели остались бы подписи на прежнем.
    setPersonal((box) => (box.updatedAt === 0 ? { ...box, items: defaultPresets(STRINGS[next].defaultPresets) } : box))
  }, [])

  const changeSkin = useCallback((next: Skin) => {
    setSkin(next)
    writeJson(SKIN_KEY, next)
  }, [])

  const toggleDiceCollapsed = useCallback(() => {
    setDiceCollapsed((collapsed) => {
      writeJson(DICE_COLLAPSED_KEY, !collapsed)
      return !collapsed
    })
  }, [])

  const togglePostToBoard = useCallback((next: boolean) => {
    setPostToBoard(next)
    writeJson(POST_TO_BOARD_KEY, next)
  }, [])

  const playerName = character || user?.name || t.player.fallbackName

  const repeatEntry = (entry: RollEntry): void => {
    // Строка с меткой уезжает и в поле ввода: повтор по Enter сохранит название.
    const source = toSource(entry.expression, entry.label)
    setFormula(source)
    roll(source)
  }

  // В терминале «сохранить» всегда кладёт в свои броски: вкладки «Общие»
  // там нет, а scope остался бы от обычного облика.
  const saveEntryToMine = (entry: RollEntry): void => {
    const items = personalRef.current.items
    const name = entry.label ?? ""
    if (items.some((item) => item.formula === entry.expression && item.name === name)) return
    savePersonal([...items, makePreset(name, entry.expression, "slate")])
  }

  const combat = (
    <Combat
      connected={status === "connected"}
      self={{ userId: playerId, name: playerName, icon: playerIcon, color: playerColor, initiative }}
      onRoll={rollCombat}
    />
  )

  const modals = (
    <>
      {helpOpen && <Help terminal={skin === "terminal"} onClose={() => setHelpOpen(false)} />}

      {settingsOpen && (
        <PlayerSettings
          character={character}
          icon={playerIcon}
          color={playerColor}
          initiative={initiative}
          status={status}
          diceSet={diceSet}
          lang={lang}
          skin={skin}
          {...(user ? { accountName: user.name } : {})}
          onSave={savePlayerLook}
          onDiceSetChange={changeDiceSet}
          onLangChange={changeLang}
          onSkinChange={changeSkin}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  )

  // Терминал — другой облик тех же данных: журнал, сохранённые броски и бой
  // общие с обычной панелью, переключение их не трогает.
  if (skin === "terminal") {
    return (
      <LangContext.Provider value={t}>
        <Terminal
          status={status}
          shareError={shareError}
          entries={entries}
          currentUserId={playerId}
          diceSet={diceSet}
          personal={personal.items}
          shared={shared}
          formula={formula}
          error={error}
          formulaHistory={formulaHistory}
          postToBoard={postToBoard}
          combat={combat}
          onFormulaChange={setFormula}
          onDismissError={() => setError(null)}
          onRoll={roll}
          onSavePersonal={savePersonal}
          onSaveShared={saveShared}
          onRepeat={repeatEntry}
          onSaveEntry={saveEntryToMine}
          onTogglePostToBoard={togglePostToBoard}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        >
          {modals}
        </Terminal>
      </LangContext.Provider>
    )
  }

  return (
    <LangContext.Provider value={t}>
    <div className="app">
      <PlayerBar
        name={playerName}
        userId={playerId}
        icon={playerIcon}
        color={playerColor}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <StatusBar status={status} />

      {shareError && <div className="warning">{shareError}</div>}

      <section className="toolbox">
        <PanelTabs
          panel={panel}
          dcc={diceSet === "dcc"}
          collapsed={diceCollapsed}
          onPanelChange={changePanel}
          onToggleCollapsed={toggleDiceCollapsed}
        />

        {!diceCollapsed &&
          (panel === "dice" ? (
            <DiceBar diceSet={diceSet} onRoll={roll} />
          ) : panel === "combat" ? (
            combat
          ) : (
            <Presets
              scope={scope}
              items={scope === "mine" ? personal.items : shared}
              sharedAvailable={status === "connected"}
              draft={presetDraft}
              onDraftChange={setPresetDraft}
              onDraftSubmit={submitDraft}
              onEdit={editPreset}
              onRoll={(preset) => roll(preset.formula, preset.name)}
              onRemove={removePreset}
              onReorder={reorderPreset}
            />
          ))}
      </section>

      <FormulaBar
        formula={formula}
        error={error}
        formulaHistory={formulaHistory}
        onFormulaChange={setFormula}
        onRoll={roll}
        onSaveCurrent={() => savePresetNow(formula)}
      />

      {modals}

      <RollLog entries={entries} currentUserId={playerId} onRepeat={repeatEntry} onSave={savePresetFromEntry} />

      <label className="checkbox">
        <input
          type="checkbox"
          checked={postToBoard}
          disabled={status !== "connected"}
          onChange={(event) => togglePostToBoard((event.target as HTMLInputElement).checked)}
        />
        {t.postToBoard}
      </label>
    </div>
    </LangContext.Provider>
  )
}
