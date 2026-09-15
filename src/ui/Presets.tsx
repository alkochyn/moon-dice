import { useEffect, useRef, useState } from "preact/hooks"

import { validateFormula } from "../dice"
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
  onScopeChange: (scope: PresetScope) => void
  items: Preset[]
  sharedAvailable: boolean
  draft: PresetDraft | null
  onDraftChange: (draft: PresetDraft | null) => void
  onDraftSubmit: () => void
  onEdit: (preset: Preset) => void
  onRoll: (preset: Preset) => void
  onRemove: (id: string) => void
  onReorder: (sourceId: string, targetId: string) => void
}

const POPOVER_MIN_WIDTH = 240
const SCREEN_MARGIN = 8

export const Presets = ({
  scope,
  onScopeChange,
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
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

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
   * Окошко привязано к месту чипа на экране, поэтому закрываем его на любой
   * прокрутке и смене размера: пересчитывать положение на каждый пиксель
   * дороже, чем просто не показывать оторвавшуюся от чипа панельку.
   */
  useEffect(() => {
    if (!editing) return undefined

    const onOutside = (event: MouseEvent): void => {
      if (!popoverRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close()
    }

    document.addEventListener("mousedown", onOutside)
    document.addEventListener("keydown", onKey)
    window.addEventListener("resize", close)
    document.addEventListener("scroll", close, true)

    return () => {
      document.removeEventListener("mousedown", onOutside)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", close)
      document.removeEventListener("scroll", close, true)
    }
  }, [editing])

  const startEdit = (preset: Preset, event: MouseEvent): void => {
    const chip = (event.currentTarget as HTMLElement).closest(".preset")
    if (!chip) return

    const rect = chip.getBoundingClientRect()
    const width = Math.max(rect.width, POPOVER_MIN_WIDTH)
    const left = Math.min(rect.left, window.innerWidth - width - SCREEN_MARGIN)

    setFormulaError(null)
    setAnchor({ top: rect.bottom + 4, left: Math.max(SCREEN_MARGIN, left), width })
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
      setFormulaError(check.message)
      return
    }

    onDraftSubmit()
    setAnchor(null)
    setFormulaError(null)
  }

  const patch = (fields: Partial<PresetDraft>): void => {
    if (draft) onDraftChange({ ...draft, ...fields })
    setFormulaError(null)
  }

  return (
    <section className="section">
      <div className="section__head">
        <span className="section__title">Сохранённые</span>
        <div className="tabs">
          <button className={`tab${scope === "mine" ? " tab--active" : ""}`} onClick={() => onScopeChange("mine")}>
            Мои
          </button>
          <button className={`tab${scope === "shared" ? " tab--active" : ""}`} onClick={() => onScopeChange("shared")}>
            Общие
          </button>
        </div>
      </div>

      {locked ? (
        <div className="empty">Общие броски доступны только на доске.</div>
      ) : items.length === 0 ? (
        <div className="empty">
          {scope === "mine" ? "Пока пусто. Сохраните формулу кнопкой ★." : "Общих бросков пока нет."}
        </div>
      ) : (
        <div className="presets">
          {items.map((preset) => (
            <span
              key={preset.id}
              className={`preset${draggingId === preset.id ? " preset--dragging" : ""}${
                draft?.id === preset.id ? " preset--editing" : ""
              }`}
              style={{ "--chip": `var(--chip-${draft?.id === preset.id ? draft.color : preset.color})` }}
              draggable
              onDragStart={(event) => {
                setDraggingId(preset.id)
                event.dataTransfer?.setData("text/plain", preset.id)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const source = draggingId ?? event.dataTransfer?.getData("text/plain")
                if (source) onReorder(source, preset.id)
                setDraggingId(null)
              }}
              onDragEnd={() => setDraggingId(null)}
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
                  title="Изменить бросок"
                  aria-label={`Изменить ${preset.name || preset.formula}`}
                >
                  ✎
                </button>
                <button
                  className="preset__action"
                  onClick={() => onRemove(preset.id)}
                  title="Удалить бросок"
                  aria-label={`Удалить ${preset.name || preset.formula}`}
                >
                  ×
                </button>
              </span>
            </span>
          ))}
        </div>
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
            placeholder="1d8+3 : Урон основной атакой"
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
                  aria-label={`Цвет ${item}`}
                />
              ))}
            </span>

            <span className="section__spacer" />

            <button className="preset__action" onClick={submit} title="Сохранить" aria-label="Сохранить бросок">
              ✓
            </button>
            <button className="preset__action" onClick={close} title="Отмена" aria-label="Отменить правку">
              ×
            </button>
          </div>

          {formulaError && <div className="error">{formulaError}</div>}
        </div>
      )}
    </section>
  )
}
