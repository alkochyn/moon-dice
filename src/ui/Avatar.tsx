import { ICONS, ICON_VIEWBOX } from "../data/icons"
import { defaultColor, defaultIconId, initials } from "../utils/avatar"

interface Props {
  name: string
  userId: string
  /** Выбор игрока; если его нет, значок выводится из id. */
  icon?: string
  color?: string
  size?: number
}

export const Avatar = ({ name, userId, icon, color, size }: Props) => {
  const path = ICONS.get(icon ?? defaultIconId(userId))
  const background = color ?? defaultColor(userId)
  const style = { background, ...(size ? { width: `${size}px`, height: `${size}px` } : {}) }

  return (
    // aria-hidden: имя игрока стоит рядом текстом, второй раз его озвучивать незачем.
    <span className="avatar" style={style} aria-hidden="true">
      {path ? (
        <svg className="avatar__icon" viewBox={ICON_VIEWBOX} xmlns="http://www.w3.org/2000/svg">
          <path d={path} fill="currentColor" />
        </svg>
      ) : (
        initials(name)
      )}
    </span>
  )
}
