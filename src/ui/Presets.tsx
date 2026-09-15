import { PRESET_COLORS, type Preset } from "../board/presets"

export type PresetScope = "mine" | "shared"

/** Черновик формы: без id — новый пресет, с id — правка существующего. */
export interface PresetDraft {
  id?: string
  name: string
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
  onOpenDraft: () => void
  onEdit: (preset: Preset) => void
  onRoll: (preset: Preset) => void
  onRemove: (id: string) => void
}

export const Presets = ({
  scope,
  onScopeChange,
  items,
  sharedAvailable,
  draft,
  onDraftChange,
  onDraftSubmit,
  onOpenDraft,
  onEdit,
  onRoll,
  onRemove,
}: Props) => {
  const locked = scope === "shared" && !sharedAvailable
  const patch = (fields: Partial<PresetDraft>): void => {
    if (draft) onDraftChange({ ...draft, ...fields })
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
        {!locked && (
          <button className="btn btn--ghost" onClick={() => (draft ? onDraftChange(null) : onOpenDraft())}>
            {draft ? "отмена" : "+ добавить"}
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
            <span key={preset.id} className="preset" style={{ "--chip": `var(--chip-${preset.color})` }}>
              <button
                className="preset__name btn btn--ghost"
                onClick={() => onRoll(preset)}
                title={`Бросить ${preset.formula}`}
              >
                {preset.name} <span className="preset__formula">{preset.formula}</span>
              </button>
              <button
                className="btn btn--ghost btn--icon"
                onClick={() => onEdit(preset)}
                title="Переименовать или изменить"
                aria-label={`Изменить ${preset.name}`}
              >
                ✎
              </button>
              <button
                className="btn btn--ghost btn--icon"
                onClick={() => onRemove(preset.id)}
                title="Удалить бросок"
                aria-label={`Удалить ${preset.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {draft && !locked && (
        <div className="preset-form">
          <input
            className="input"
            placeholder="Название, например «Урон основной атакой»"
            value={draft.name}
            onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => e.key === "Enter" && onDraftSubmit()}
          />
          <input
            className="input"
            placeholder="Формула"
            value={draft.formula}
            onInput={(e) => patch({ formula: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => e.key === "Enter" && onDraftSubmit()}
          />
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
          <button className="btn btn--primary" onClick={onDraftSubmit}>
            {draft.id ? "Сохранить" : "Добавить"}
          </button>
        </div>
      )}
    </section>
  )
}
