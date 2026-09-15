import { useEffect, useRef, useState } from "preact/hooks"

import { validateFormula } from "../dice"
import { PRESET_COLORS, type Preset } from "../board/presets"

export type PresetScope = "mine" | "shared"

/**
 * Черновик формы: без id — новый пресет, с id — правка существующего.
 *
 * Отдельного поля названия нет: формула и так умеет метку после двоеточия,
 * а два поля для одного и того же путали — их легко заполнить наоборот.
 */
export interface PresetDraft {
  id?: string
  formula: string
  color: string
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
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const paletteRef = useRef<HTMLSpanElement>(null)

  // Палитра закрывается кликом мимо: она перекрывает соседние элементы формы,
  // и оставлять её открытой после выбора незачем.
  useEffect(() => {
    if (!paletteOpen) return undefined

    const onDown = (event: MouseEvent): void => {
      if (!paletteRef.current?.contains(event.target as Node)) setPaletteOpen(false)
    }

    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [paletteOpen])

  const locked = scope === "shared" && !sharedAvailable
  const patch = (fields: Partial<PresetDraft>): void => {
    if (draft) onDraftChange({ ...draft, ...fields })
    setFormulaError(null)
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

    setFormulaError(null)
    onDraftSubmit()
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
            Доски
          </button>
        </div>
        <span className="section__spacer" />
        {draft && !locked && (
          <button className="btn btn--ghost" onClick={() => onDraftChange(null)}>
            отмена
          </button>
        )}
      </div>

      {locked ? (
        <div className="empty">Общие пресеты доступны только на доске.</div>
      ) : items.length === 0 ? (
        <div className="empty">
          {scope === "mine" ? "Пока пусто. Сохраните формулу кнопкой ★." : "Общих бросков пока нет."}
        </div>
      ) : (
        <div className="presets">
          {items.map((preset) => (
            <span
              key={preset.id}
              className={`preset${draggingId === preset.id ? " preset--dragging" : ""}`}
              style={{ "--chip": `var(--chip-${preset.color})` }}
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
                  onClick={() => onEdit(preset)}
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

      {draft && !locked && (
        <div className="preset-form">
          <input
            className="input preset-form__formula"
            placeholder="1d8+3 : Урон основной атакой"
            value={draft.formula}
            onInput={(e) => patch({ formula: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <span className="color-picker" ref={paletteRef}>
            <button
              className="color color--current"
              style={{ "--chip": `var(--chip-${draft.color})` }}
              onClick={() => setPaletteOpen((open) => !open)}
              aria-label="Цвет метки"
              aria-expanded={paletteOpen}
            />
            {paletteOpen && (
              <span className="color-picker__menu">
                {PRESET_COLORS.map((item) => (
                  <button
                    key={item}
                    className={`color${draft.color === item ? " color--active" : ""}`}
                    style={{ "--chip": `var(--chip-${item})` }}
                    onClick={() => {
                      patch({ color: item })
                      setPaletteOpen(false)
                    }}
                    aria-label={`Цвет ${item}`}
                  />
                ))}
              </span>
            )}
          </span>
          <button className="btn btn--primary" onClick={submit}>
            Сохранить
          </button>
          {formulaError && <div className="error">{formulaError}</div>}
        </div>
      )}
    </section>
  )
}
