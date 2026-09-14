import { useState } from "preact/hooks"
import { PRESET_COLORS, type Preset } from "../board/presets"

export type PresetScope = "mine" | "shared"

interface Props {
  scope: PresetScope
  onScopeChange: (scope: PresetScope) => void
  items: Preset[]
  sharedAvailable: boolean
  draftFormula: string
  onRoll: (formula: string) => void
  onAdd: (name: string, formula: string, color: string) => void
  onRemove: (id: string) => void
}

export const Presets = ({
  scope,
  onScopeChange,
  items,
  sharedAvailable,
  draftFormula,
  onRoll,
  onAdd,
  onRemove,
}: Props) => {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [formula, setFormula] = useState("")
  const [color, setColor] = useState<string>("slate")

  const openForm = (): void => {
    setFormula(draftFormula)
    setName("")
    setAdding(true)
  }

  const submit = (): void => {
    if (!formula.trim()) return
    onAdd(name, formula, color)
    setAdding(false)
    setName("")
    setFormula("")
  }

  const locked = scope === "shared" && !sharedAvailable

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
          <button className="btn btn--ghost" onClick={() => (adding ? setAdding(false) : openForm())}>
            {adding ? "отмена" : "+ добавить"}
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
                onClick={() => onRoll(preset.formula)}
                title={`Бросить ${preset.formula}`}
              >
                {preset.name} <span className="preset__formula">{preset.formula}</span>
              </button>
              <button
                className="btn btn--ghost btn--icon"
                onClick={() => onRemove(preset.id)}
                title="Удалить пресет"
                aria-label={`Удалить ${preset.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {adding && !locked && (
        <div className="preset-form">
          <input
            className="input"
            placeholder="Название"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <input
            className="input"
            placeholder="Формула"
            value={formula}
            onInput={(e) => setFormula((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <span className="colors">
            {PRESET_COLORS.map((item) => (
              <button
                key={item}
                className={`color${color === item ? " color--active" : ""}`}
                style={{ "--chip": `var(--chip-${item})` }}
                onClick={() => setColor(item)}
                aria-label={`Цвет ${item}`}
              />
            ))}
          </span>
          <button className="btn btn--primary" onClick={submit}>
            Сохранить
          </button>
        </div>
      )}
    </section>
  )
}
