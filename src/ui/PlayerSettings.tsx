import { useEffect, useRef, useState } from "preact/hooks"

import type { BoardStatus } from "../board/sdk"
import { DICE_SETS } from "../data/diceSets"
import { validateFormula } from "../dice"
import { LANGS, useT, type Lang } from "../i18n"
import { SKINS, type Skin } from "../skins"
import { Diagnostics } from "./Diagnostics"

import { ICONS, ICON_AUTHORS, ICON_IDS, ICON_VIEWBOX } from "../data/icons"
import { AVATAR_COLORS, randomColor, randomIconId } from "../utils/avatar"
import { Avatar } from "./Avatar"

export const MAX_CHARACTER_NAME = 40

export interface PlayerLook {
  character: string
  icon: string
  color: string
  /** Формула инициативы: её кидает мастер за всех в начале боя. */
  initiative: string
}

interface Props extends PlayerLook {
  accountName?: string
  status: BoardStatus
  diceSet: string
  lang: Lang
  skin: Skin
  onSave: (look: PlayerLook) => void
  onDiceSetChange: (id: string) => void
  onLangChange: (lang: Lang) => void
  onSkinChange: (skin: Skin) => void
  onClose: () => void
}

export const PlayerSettings = ({
  character,
  icon,
  color,
  initiative,
  accountName,
  status,
  diceSet,
  lang,
  skin,
  onSave,
  onDiceSetChange,
  onLangChange,
  onSkinChange,
  onClose,
}: Props) => {
  const t = useT()
  const [name, setName] = useState(character)
  const [pickedSet, setPickedSet] = useState(diceSet)
  const [pickedLang, setPickedLang] = useState(lang)
  const [pickedSkin, setPickedSkin] = useState(skin)
  const [pickedIcon, setPickedIcon] = useState(icon)
  const [pickedColor, setPickedColor] = useState(color)
  const [initiativeFormula, setInitiativeFormula] = useState(initiative)
  const initiativeInvalid = initiativeFormula.trim() !== "" && !validateFormula(initiativeFormula).ok
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
    // С кривой формулой мастер споткнётся о неё в начале боя — лучше здесь.
    if (initiativeInvalid) return
    onSave({
      character: name.trim().slice(0, MAX_CHARACTER_NAME),
      icon: pickedIcon,
      color: pickedColor,
      initiative: initiativeFormula.trim(),
    })
    onDiceSetChange(pickedSet)
    onLangChange(pickedLang)
    onSkinChange(pickedSkin)
    onClose()
  }

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__card" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={t.settings.title}>
        <div className="modal__head">
          <Avatar name={name || accountName || t.player.accountFallback} userId="" icon={pickedIcon} color={pickedColor} size={32} />
          <span className="modal__title">{t.settings.title}</span>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label={t.settings.close}>
            ×
          </button>
        </div>

        <label className="modal__field">
          {t.settings.characterName}
          <input
            ref={inputRef}
            className="input"
            type="text"
            autocomplete="off"
            maxLength={MAX_CHARACTER_NAME}
            placeholder={accountName ? t.settings.namePlaceholderAccount(accountName) : t.settings.namePlaceholder}
            value={name}
            onInput={(event) => setName((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
        </label>

        <label className="modal__field">
          {t.settings.initiative}
          <input
            className={`input${initiativeInvalid ? " input--invalid" : ""}`}
            type="text"
            autocomplete="off"
            spellcheck={false}
            placeholder="1d20+2"
            value={initiativeFormula}
            onInput={(event) => setInitiativeFormula((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
          <span className="modal__hint">{t.settings.initiativeHint}</span>
        </label>

        <div className="modal__field">
          <span className="modal__label">
            {t.settings.color}
            <button className="btn btn--ghost modal__shuffle" onClick={shuffle} title={t.settings.shuffleTitle}>
              {t.settings.shuffle}
            </button>
          </span>
          <span className="colors">
            {AVATAR_COLORS.map((item) => (
              <button
                key={item}
                className={`color${pickedColor === item ? " color--active" : ""}`}
                style={{ "--chip": item }}
                onClick={() => setPickedColor(item)}
                aria-label={t.settings.colorNamed(item)}
              />
            ))}
          </span>
        </div>

        <div className="modal__field">
          {t.settings.icon}
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
          {t.settings.hint} {t.settings.iconCredits(ICON_AUTHORS.join(", "))}
        </p>

        {/* Набор — настройка игрока, а не доски: в одной партии кто-то играет
            за DCC-волшебника с цепочкой кубов, кто-то обходится стандартом. */}
        <label className="modal__field modal__field--group">
          {t.settings.language}
          <select
            className="input"
            value={pickedLang}
            onChange={(event) => setPickedLang((event.target as HTMLSelectElement).value as Lang)}
          >
            {LANGS.map((item) => (
              <option key={item.id} value={item.id} lang={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>

        <label className="modal__field">
          {t.settings.skin}
          <select
            className="input"
            value={pickedSkin}
            onChange={(event) => setPickedSkin((event.target as HTMLSelectElement).value as Skin)}
          >
            {SKINS.map((item) => (
              <option key={item} value={item}>
                {t.skins[item] ?? item}
              </option>
            ))}
          </select>
          <span className="modal__hint">{t.settings.skinHint}</span>
        </label>

        <label className="modal__field">
          {t.settings.diceSet}
          <select
            className="input"
            value={pickedSet}
            onChange={(event) => setPickedSet((event.target as HTMLSelectElement).value)}
          >
            {DICE_SETS.map((set) => (
              <option key={set.id} value={set.id} title={set.hint}>
                {t.diceSets[set.id] ?? set.title}
              </option>
            ))}
          </select>
        </label>

        <div className="modal__field">
          <button className="btn btn--ghost modal__diag-toggle" onClick={() => setDiagnosticsOpen((open) => !open)}>
            {diagnosticsOpen ? t.settings.hideDiagnostics : t.settings.showDiagnostics}
          </button>
          {diagnosticsOpen && <Diagnostics status={status} />}
        </div>

        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            {t.settings.cancel}
          </button>
          <button className="btn btn--primary" onClick={save} disabled={initiativeInvalid}>
            {t.settings.save}
          </button>
        </div>
      </div>
    </div>
  )
}
