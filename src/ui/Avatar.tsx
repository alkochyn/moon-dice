import { avatarColor, initials } from "../utils/avatar"

interface Props {
  name: string
  userId: string
}

export const Avatar = ({ name, userId }: Props) => (
  // aria-hidden: имя игрока стоит рядом текстом, второй раз его озвучивать незачем.
  <span className="avatar" style={{ background: avatarColor(userId || name) }} title={name} aria-hidden="true">
    {initials(name)}
  </span>
)
