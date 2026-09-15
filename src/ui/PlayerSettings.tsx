import { useEffect, useRef, useState } from "preact/hooks"

interface Props {
  character: string
  accountName?: string
  onSave: (name: string) => void
  onClose: () => void
}

export const MAX_CHARACTER_NAME = 40

export const PlayerSettings = ({ character, accountName, onSave, onClose }: Props) => {
  const [value, setValue] = useState(character)
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

  const save = (): void => {
    onSave(value.trim().slice(0, MAX_CHARACTER_NAME))
    onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Настройки">
        <div className="modal__head">
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
            value={value}
            onInput={(event) => setValue((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
        </label>

        <p className="modal__hint">
          Этим именем будут подписаны ваши броски в общей истории — его увидит вся партия. Оставьте поле пустым, чтобы
          вернуться к имени аккаунта.
        </p>

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
