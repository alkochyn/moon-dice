import { Fragment } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

import { validateFormula } from "../dice"
import { describeDiceError, useT } from "../i18n"
import { PRESET_COLORS, type Preset } from "../board/presets"

export type PresetScope = "mine" | "shared"

/**
 * Черновик правки сохранённого броска.
 *
 * Отдельного поля названия нет: формула и так умеет метку после двоеточия,
 * а два поля для одного и того же путали — их легко заполнить наоборот.
 */
export interface PresetDraft {
  id?: string
  formula: string
  color: string
}

interface Anchor {
  top: number
  left: number
  width: number
}

interface Props {
  scope: PresetScope
  items: Preset[]
  sharedAvailable: boolean
  draft: PresetDraft | null
  onDraftChange: (draft: PresetDraft | null) => void
  onDraftSubmit: () => void
  onEdit: (preset: Preset) => void
  onRoll: (preset: Preset) => void
  onRemove: (id: string) => void
  /** index — промежуток в списке без переносимого броска. */
  onReorder: (sourceId: string, index: number) => void
}

/** Перетаскиваемый чип: где взяли, где указатель сейчас и куда встанет. */
interface Drag {
  id: string
  startX: number
  startY: number
  x: number
  y: number
  /** Где внутри чипа его схватили: копия едет за курсором тем же местом. */
  grabX: number
  grabY: number
  width: number
  /** Ложь, пока указатель не ушёл дальше порога: до этого это ещё клик. */
  active: boolean
  /** Промежуток в списке без переносимого чипа, куда он встанет; null —
   *  указатель далеко от списка, и отпущенный чип вернётся на место. */
  index: number | null
}

/** Насколько можно увести указатель от списка, чтобы линия ещё держалась. */
const DROP_MARGIN = 24

/**
 * Куда встанет чип, если отпустить его здесь. Ряды берём из раскладки:
 * сначала ряд по вертикали, в нём — первый чип, чья середина правее
 * указателя. Ниже всех рядов — в конец, а совсем в стороне от списка —
 * никуда: перенос отменяется.
 */
const dropIndex = (list: HTMLElement, x: number, y: number): number | null => {
  const area = list.getBoundingClientRect()
  const outside =
    x < area.left - DROP_MARGIN ||
    x > area.right + DROP_MARGIN ||
    y < area.top - DROP_MARGIN ||
    y > area.bottom + DROP_MARGIN
  if (outside) return null

  const chips = [...list.querySelectorAll<HTMLElement>(".preset")]
  const rects = chips.map((chip) => chip.getBoundingClientRect())

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i] as DOMRect
    const sameRow = y >= rect.top - 3 && y <= rect.bottom + 3
    if (!sameRow) continue

    if (x < rect.left + rect.width / 2) return i
    const next = rects[i + 1]
    // Последний в ряду: следующий чип уже ниже, значит место — после этого.
    if (!next || next.top > rect.bottom) return i + 1
  }

  const first = rects[0]
  if (first && y < first.top) return 0
  return rects.length
}

const DRAG_THRESHOLD = 5

const clamp = (value: number, max: number): number => Math.max(0, Math.min(value, max))
const POPOVER_MIN_WIDTH = 240
const SCREEN_MARGIN = 8

/** Ставит окошко под чипом, не давая ему вылезти за край панели. */
const placeBelow = (rect: DOMRect): Anchor => {
  const width = Math.max(rect.width, POPOVER_MIN_WIDTH)
  const left = Math.min(rect.left, window.innerWidth - width - SCREEN_MARGIN)

  return { top: rect.bottom + 4, left: Math.max(SCREEN_MARGIN, left), width }
}

export const Presets = ({
  scope,
  items,
  sharedAvailable,
  draft,
  onDraftChange,
  onDraftSubmit,
  onEdit,
  onRoll,
  onRemove,
  onReorder,
}: Props) => {
  const t = useT()
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const swallowClick = useRef(false)
  const ghostRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLElement | null>(null)

  const locked = scope === "shared" && !sharedAvailable
  const editing = Boolean(draft && anchor)

  const close = (): void => {
    onDraftChange(null)
    setAnchor(null)
    setFormulaError(null)
  }

  useEffect(() => {
    if (draft) inputRef.current?.focus()
  }, [draft?.id])

  /*
   * Окошко привязано к месту чипа на экране, поэтому при прокрутке и смене
   * размера переставляем его следом. Раньше оно на любой скролл закрывалось,
   * но слушатель ловил прокрутку чего угодно, включая журнал, и правка
   * захлопывалась от постороннего движения.
   */
  useEffect(() => {
    if (!editing) return undefined

    const onOutside = (event: MouseEvent): void => {
      if (!popoverRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close()
    }
    const reposition = (): void => {
      const rect = chipRef.current?.getBoundingClientRect()
      if (rect) setAnchor(placeBelow(rect))
    }

    document.addEventListener("mousedown", onOutside)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", reposition)
    document.addEventListener("scroll", reposition, true)

    return () => {
      document.removeEventListener("mousedown", onOutside)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", reposition)
      document.removeEventListener("scroll", reposition, true)
    }
  }, [editing])

  const startEdit = (preset: Preset, event: MouseEvent): void => {
    const chip = (event.currentTarget as HTMLElement).closest(".preset") as HTMLElement | null
    if (!chip) return

    chipRef.current = chip
    setFormulaError(null)
    setAnchor(placeBelow(chip.getBoundingClientRect()))
    onEdit(preset)
  }

  /**
   * Формулу проверяем до сохранения: сохранённый бросок с мусором в формуле
   * выглядит рабочим до первого клика, а ошибку игрок увидит уже в другом месте
   * панели и не поймёт, откуда она.
   */
  const submit = (): void => {
    if (!draft) return

    const check = validateFormula(draft.formula)
    if (!check.ok) {
      setFormulaError(describeDiceError(t, check.error))
      return
    }

    onDraftSubmit()
    setAnchor(null)
    setFormulaError(null)
  }

  /*
   * Перетаскивание на указателе, а не на HTML5 drag and drop: тот не стартует
   * с кнопки внутри чипа в Firefox, не работает на тачскрине и в кадре Miro
   * вёл себя непредсказуемо. Взятый чип уходит из ряда и едет копией за
   * курсором, а между оставшимися встаёт линия — туда он и ляжет; соседи
   * справа раздвигаются под неё.
   */
  const updateDrag = (next: Drag | null): void => {
    dragRef.current = next
    setDrag(next)
  }

  const startDrag = (preset: Preset, event: PointerEvent): void => {
    if (event.button !== 0 || editing) return
    // С карандаша и крестика чип не тащим — по ним жмут, а не тянут.
    if ((event.target as HTMLElement).closest(".preset__action")) return

    const chip = event.currentTarget as HTMLElement
    const rect = chip.getBoundingClientRect()
    const list = chip.parentElement as HTMLElement
    dragRef.current = {
      id: preset.id,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
      active: false,
      index: items.findIndex((item) => item.id === preset.id),
    }

    const onMove = (move: PointerEvent): void => {
      const current = dragRef.current
      if (!current) return

      const moved = Math.hypot(move.clientX - current.startX, move.clientY - current.startY)
      // Порог, чтобы дрогнувшая при клике рука не превращала бросок в перенос.
      if (!current.active && moved < DRAG_THRESHOLD) return

      if (!current.active) {
        // Выделение, начатое до порога (из-за соседнего текста), сбрасываем.
        window.getSelection()?.removeAllRanges()
        // Захват на список, а не на чип: чип на время переноса уходит из
        // разметки. С захватом указатель не теряется и за краем панели —
        // иначе отпущенная там кнопка оставляла бы перенос висеть.
        try {
          list.setPointerCapture(move.pointerId)
        } catch {
          // Синтетические события без настоящего указателя захват не дают.
        }
      }

      // Пока чип ещё в ряду (первый кадр переноса), считаем по прежнему месту.
      const index = current.active ? dropIndex(list, move.clientX, move.clientY) : current.index
      updateDrag({ ...current, x: move.clientX, y: move.clientY, active: true, index })
    }

    const finish = (event: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)

      const current = dragRef.current
      if (current?.active) {
        // Отпускание кнопки над чипом рождает click — без этого перенос
        // заканчивался бы ещё и броском.
        swallowClick.current = true
        setTimeout(() => (swallowClick.current = false), 0)
        // Отменённый жест (pointercancel) порядок не трогает.
        if (event.type === "pointerup" && current.index !== null) onReorder(current.id, current.index)
      }
      updateDrag(null)
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
  }

  const dragged = drag?.active ? items.find((item) => item.id === drag.id) : undefined
  // Взятый чип уходит из ряда: остальные смыкаются, а линия показывает место.
  const visible = dragged ? items.filter((item) => item !== dragged) : items

  const patch = (fields: Partial<PresetDraft>): void => {
    if (draft) onDraftChange({ ...draft, ...fields })
    setFormulaError(null)
  }

  return (
    <>
      {locked ? (
        <div className="empty">{t.presets.sharedOffline}</div>
      ) : items.length === 0 ? (
        <div className="empty">{scope === "mine" ? t.presets.emptyMine : t.presets.emptyShared}</div>
      ) : (
        <div
          className={`presets${drag?.active ? " presets--dragging" : ""}`}
          onClickCapture={(event) => {
            if (!swallowClick.current) return
            event.stopPropagation()
            event.preventDefault()
          }}
        >
          {visible.map((preset, position) => (
            <Fragment key={preset.id}>
              {drag?.active && drag.index === position && <span className="preset-drop" aria-hidden="true" />}
              <span
                data-id={preset.id}
                className={`preset${draft?.id === preset.id ? " preset--editing" : ""}`}
                style={{ "--chip": `var(--chip-${draft?.id === preset.id ? draft.color : preset.color})` }}
                onPointerDown={(event) => startDrag(preset, event as unknown as PointerEvent)}
              >
                <button className="preset__name" onClick={() => onRoll(preset)}>
                  <span className="preset__formula">{preset.formula}</span>
                  {preset.name && (
                    <span className="preset__label" title={preset.name}>
                      {preset.name}
                    </span>
                  )}
                </button>

                {/* Карандаш и крестик всплывают по наведению: постоянно они
                  съедали половину ширины чипа. */}
                <span className="preset__actions">
                  <button
                    className="preset__action"
                    onClick={(event) => startEdit(preset, event as unknown as MouseEvent)}
                    title={t.presets.edit}
                    aria-label={t.presets.editNamed(preset.name || preset.formula)}
                  >
                    ✎
                  </button>
                  <button
                    className="preset__action"
                    onClick={() => onRemove(preset.id)}
                    title={t.presets.remove}
                    aria-label={t.presets.removeNamed(preset.name || preset.formula)}
                  >
                    ×
                  </button>
                </span>
              </span>
            </Fragment>
          ))}
          {drag?.active && drag.index !== null && drag.index >= visible.length &&<span className="preset-drop" aria-hidden="true" />}
        </div>
      )}

      {/* Копия взятого чипа едет за курсором поверх всей панели. */}
      {drag && dragged && (
        <span
          ref={ghostRef}
          className="preset preset--ghost"
          aria-hidden="true"
          style={{
            "--chip": `var(--chip-${dragged.color})`,
            // Копия не выезжает за край панели: за ним её обрезал бы кадр Miro.
            left: `${clamp(drag.x - drag.grabX, window.innerWidth - drag.width)}px`,
            top: `${clamp(drag.y - drag.grabY, window.innerHeight - (ghostRef.current?.offsetHeight ?? 0))}px`,
            width: `${drag.width}px`,
          }}
        >
          <span className="preset__name">
            <span className="preset__formula">{dragged.formula}</span>
            {dragged.name && <span className="preset__label">{dragged.name}</span>}
          </span>
        </span>
      )}

      {/*
       * Правка живёт в окошке рядом с чипом, а не в самом чипе: раздуваясь под
       * поле ввода, чип перестраивал всю сетку, и она прыгала под курсором.
       * Окошко ничего не двигает, а места в нём хватает и на полную формулу,
       * и на все цвета сразу.
       */}
      {draft && anchor && (
        <div
          ref={popoverRef}
          className="preset-edit"
          style={{ top: `${anchor.top}px`, left: `${anchor.left}px`, width: `${anchor.width}px` }}
        >
          <input
            ref={inputRef}
            className={`input preset-edit__input${formulaError ? " input--invalid" : ""}`}
            value={draft.formula}
            placeholder={t.presets.editPlaceholder}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => patch({ formula: (event.target as HTMLInputElement).value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />

          <div className="preset-edit__row">
            <span className="colors">
              {PRESET_COLORS.map((item) => (
                <button
                  key={item}
                  className={`color${draft.color === item ? " color--active" : ""}`}
                  style={{ "--chip": `var(--chip-${item})` }}
                  onClick={() => patch({ color: item })}
                  aria-label={t.presets.color(item)}
                />
              ))}
            </span>

            <span className="section__spacer" />

            <button className="preset__action" onClick={submit} title={t.presets.save} aria-label={t.presets.saveRoll}>
              ✓
            </button>
            <button
              className="preset__action"
              onClick={close}
              title={t.presets.cancel}
              aria-label={t.presets.cancelEdit}
            >
              ×
            </button>
          </div>

          {formulaError && <div className="error">{formulaError}</div>}
        </div>
      )}
    </>
  )
}
