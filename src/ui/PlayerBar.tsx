import { useT } from "../i18n"
import { Avatar } from "./Avatar"
import { HelpIcon, SettingsIcon } from "./icons"

interface Props {
  name: string
  userId: string
  icon: string
  color: string
  onOpenHelp: () => void
  onOpenSettings: () => void
}

/**
 * Верхняя строка панели: кто сейчас кидает и служебные кнопки. Игрок сразу
 * видит, под каким именем и значком его броски уйдут в журнал, а клик по
 * имени ведёт туда, где их меняют.
 */
export const PlayerBar = ({ name, userId, icon, color, onOpenHelp, onOpenSettings }: Props) => {
  const t = useT()

  return (
  <div className="playerbar">
    <button className="playerbar__who" onClick={onOpenSettings} title={t.player.openSettings}>
      <Avatar name={name} userId={userId} icon={icon} color={color} size={22} />
      <span className="playerbar__name">{name}</span>
    </button>

    <span className="section__spacer" />

    <button className="btn btn--ghost btn--icon" onClick={onOpenHelp} title={t.header.helpTitle} aria-label={t.header.help}>
      <HelpIcon />
    </button>
    <button className="btn btn--ghost btn--icon" onClick={onOpenSettings} title={t.header.settings} aria-label={t.header.settings}>
      <SettingsIcon />
    </button>
  </div>
  )
}
