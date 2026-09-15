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

/** Двадцатигранник анфас — кнопка броска. */
export const DieIcon = ({ className }: Props) => (
  <svg {...box} className={`icon${className ? ` ${className}` : ""}`} fill="none" stroke="currentColor">
    <path d="M12 2 21 7v10l-9 5-9-5V7z" stroke-width="1.6" stroke-linejoin="round" />
    <path d="M12 6.5 17.5 16h-11z" stroke-width="1.4" stroke-linejoin="round" />
  </svg>
)

export const StarIcon = ({ className }: Props) => (
  <svg {...box} className={`icon${className ? ` ${className}` : ""}`} fill="currentColor">
    <path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.6l-5.9 3.1 1.2-6.6L2.5 9.5l6.6-.9z" />
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
