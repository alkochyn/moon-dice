/**
 * Иконки интерфейса — отдельные от значков игроков.
 *
 * Рисуем сами, а не берём глифы вроде ★ и ↻: у символов разные метрики, и
 * рядом они не выравниваются, сколько ни правь отступы. Одинаковый viewBox
 * даёт одинаковую коробку и предсказуемое выравнивание.
 */
interface Props {
  className?: string
}

const box = {
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": "true",
  focusable: "false",
} as const

/**
 * Два шестигранника — кнопка броска. Не d20: кнопка d20 стоит прямо над
 * полем, и иконка-двадцатигранник читалась бы как «кинуть d20», а не как
 * «кинуть то, что написано».
 */
export const RollIcon = ({ className }: Props) => (
  <svg {...box} className={`icon${className ? ` ${className}` : ""}`} fill="none" stroke="currentColor">
    <rect x="2.5" y="8.5" width="11" height="11" rx="2.2" stroke-width="1.6" stroke-linejoin="round" />
    <rect
      x="11"
      y="3"
      width="10"
      height="10"
      rx="2"
      transform="rotate(18 16 8)"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <g fill="currentColor" stroke="none">
      <circle cx="5.6" cy="11.6" r="1.05" />
      <circle cx="8" cy="14" r="1.05" />
      <circle cx="10.4" cy="16.4" r="1.05" />
      <circle cx="14.6" cy="6.4" r="1" />
      <circle cx="17.6" cy="9.6" r="1" />
    </g>
  </svg>
)

export const StarIcon = ({ className }: Props) => (
  <svg {...box} className={`icon${className ? ` ${className}` : ""}`} fill="currentColor">
    <path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.6l-5.9 3.1 1.2-6.6L2.5 9.5l6.6-.9z" />
  </svg>
)

/**
 * Дискета — сохранить бросок. Звезда осталась только на вкладке «Мои
 * броски»: как кнопка она читалась «в избранное» или «оценить», а не
 * «сохранить».
 */
export const SaveIcon = ({ className }: Props) => (
  <svg
    {...box}
    className={`icon${className ? ` ${className}` : ""}`}
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linejoin="round"
  >
    <path d="M4.5 3.5h12l3 3v12.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z" />
    <path d="M8 3.5v5h7v-5" />
    <rect x="7.5" y="13" width="9" height="7.5" rx="0.5" />
  </svg>
)

/** Круговая стрелка — переброс. */
export const RepeatIcon = ({ className }: Props) => (
  <svg
    {...box}
    className={`icon${className ? ` ${className}` : ""}`}
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M20 11.5a8 8 0 1 1-2.6-5.9" />
    <path d="M20.5 2.5v5h-5" />
  </svg>
)

/** Шеврон вверх; свёрнутое состояние — тот же шеврон, повёрнутый стилями. */
export const ChevronIcon = ({ className }: Props) => (
  <svg
    {...box}
    className={`icon${className ? ` ${className}` : ""}`}
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M6 15l6-6 6 6" />
  </svg>
)

export const HelpIcon = ({ className }: Props) => (
  <svg
    {...box}
    className={`icon${className ? ` ${className}` : ""}`}
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8" />
    <path d="M12 17.2v.1" stroke-width="2.2" />
  </svg>
)

/** Ползунки — настройки. Шестерёнка в 16 пикселях превращается в кляксу. */
export const SettingsIcon = ({ className }: Props) => (
  <svg
    {...box}
    className={`icon${className ? ` ${className}` : ""}`}
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
  >
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
)

/** Два звена цепи — общие броски, привязанные к доске. */
export const LinkIcon = ({ className }: Props) => (
  <svg
    {...box}
    className={`icon${className ? ` ${className}` : ""}`}
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
  </svg>
)
