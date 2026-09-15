import { useEffect, useRef, useState } from "preact/hooks"

import type { BoardStatus } from "../board/sdk"
import { Diagnostics } from "./Diagnostics"

import { ICONS, ICON_AUTHORS, ICON_IDS, ICON_VIEWBOX } from "../data/icons"
import { AVATAR_COLORS, randomColor, randomIconId } from "../utils/avatar"
import { Avatar } from "./Avatar"

export const MAX_CHARACTER_NAME = 40

export interface PlayerLook {
  character: string
  icon: string
  color: string
}

interface Props extends PlayerLook {
  accountName?: string
  status: BoardStatus
  onSave: (look: PlayerLook) => void
  onClose: () => void
}

export const PlayerSettings = ({ character, icon, color, accountName, status, onSave, onClose }: Props) => {
  const [name, setName] = useState(character)
  const [pickedIcon, setPickedIcon] = useState(icon)
  const [pickedColor, setPickedColor] = useState(color)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Escape закрывает окно — вешаем на документ, чтобы работало и когда фокус
  // ушёл с поля.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const shuffle = (): void => {
    setPickedIcon(randomIconId())
    setPickedColor(randomColor())
  }

  const save = (): void => {
    onSave({ character: name.trim().slice(0, MAX_CHARACTER_NAME), icon: pickedIcon, color: pickedColor })
    onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Настройки">
        <div className="modal__head">
          <Avatar name={name || accountName || "Игрок"} userId="" icon={pickedIcon} color={pickedColor} size={32} />
          <span className="modal__title">Настройки игрока</span>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <label className="modal__field">
          Имя персонажа
          <input
            ref={inputRef}
            className="input"
            type="text"
            autocomplete="off"
            maxLength={MAX_CHARACTER_NAME}
            placeholder={accountName ? `по умолчанию: ${accountName}` : "например, Хельга Одноглазая"}
            value={name}
            onInput={(event) => setName((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
        </label>

        <div className="modal__field">
          <span className="modal__label">
            Цвет
            <button className="btn btn--ghost modal__shuffle" onClick={shuffle} title="Случайные иконка и цвет">
              🎲 случайно
            </button>
          </span>
          <span className="colors">
            {AVATAR_COLORS.map((item) => (
              <button
                key={item}
                className={`color${pickedColor === item ? " color--active" : ""}`}
                style={{ "--chip": item }}
                onClick={() => setPickedColor(item)}
                aria-label={`Цвет ${item}`}
              />
            ))}
          </span>
        </div>

        <div className="modal__field">
          Иконка
          <div className="icon-grid">
            {ICON_IDS.map((id) => (
              <button
                key={id}
                className={`icon-grid__item${pickedIcon === id ? " icon-grid__item--active" : ""}`}
                onClick={() => setPickedIcon(id)}
                title={id}
                aria-label={id}
                style={pickedIcon === id ? { background: pickedColor, color: "#fff" } : undefined}
              >
                <svg viewBox={ICON_VIEWBOX} xmlns="http://www.w3.org/2000/svg">
                  <path d={ICONS.get(id)} fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        <p className="modal__hint">
          Имя, иконка и цвет видны всей партии в истории бросков. Оставьте имя пустым, чтобы вернуться к имени аккаунта.
          Иконки — game-icons.net ({ICON_AUTHORS.join(", ")}), лицензия CC BY 3.0.
        </p>

        <div className="modal__field">
          <button className="btn btn--ghost modal__diag-toggle" onClick={() => setDiagnosticsOpen((open) => !open)}>
            {diagnosticsOpen ? "скрыть диагностику" : "диагностика"}
          </button>
          {diagnosticsOpen && <Diagnostics status={status} />}
        </div>

        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={save}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}
