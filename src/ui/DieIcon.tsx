import type { JSX } from "preact"

/*
 * Контурные иконки кубов в сетке 16×16. Рисуются цветом кнопки (currentColor),
 * поэтому оттенок куба задаётся одним местом — стилем самой кнопки.
 * Путь с классом die-icon__back залит фоном кнопки: у пар кубов передний
 * перекрывает задний, и без заливки линии просвечивали бы насквозь.
 */
const SHAPES: Record<number, JSX.Element> = {
  2: (
    <>
      <path d="M1.5 6.5 V9.5 A6.5 3.8 0 0 0 14.5 9.5 V6.5" />
      <ellipse cx="8" cy="6.5" rx="6.5" ry="3.8" />
      <ellipse cx="8" cy="6.5" rx="3.6" ry="2" />
    </>
  ),
  // d3 — обычный шестигранник, где каждое значение стоит на двух гранях: куб с римской III.
  // Передняя грань смотрит прямо на зрителя: в изометрии грани узкие,
  // и три черты на них слипались.
  3: (
    <path d="M1.5 5 H11 V14.5 H1.5 Z M1.5 5 L4.5 2 H14 L11 5 M14 2 V11.5 L11 14.5 M4.25 7.6 V11.9 M6.25 7.6 V11.9 M8.25 7.6 V11.9" />
  ),
  4: <path d="M8 1.5 L14.5 13.5 L1.5 13.5 Z M8 1.5 L9 10 M1.5 13.5 L9 10 L14.5 13.5" />,
  5: <path d="M1.5 14 L6.5 5 L9.5 3 L14.5 12 L11.5 14 Z M6.5 5 L11.5 14" />,
  6: (
    <>
      <path className="die-icon__back" d="M8 1.5 L14 5 L14 11.5 L8 15 L2 11.5 L2 5 Z" />
      <path d="M2 5 L8 8.5 L14 5 M8 8.5 L8 15" />
    </>
  ),
  7: (
    <path d="M1.5 7.8 L6.3 4.3 L9.3 1.8 L14.1 5.3 L12.2 10.9 L9.2 13.4 L3.4 13.4 Z M6.3 4.3 L11.1 7.8 L9.2 13.4 M11.1 7.8 L14.1 5.3" />
  ),
  8: <path d="M8 1 L14 7.2 L8 15 L2 7.2 Z M8 1 L7 9.2 L8 15 M2 7.2 L7 9.2 L14 7.2" />,
  // Настоящий d10 приплюснут у полюсов: углы сверху и снизу тупые.
  10: (
    <>
      <path className="die-icon__back" d="M8 2.5 L15 6.8 L15 8.6 L8 13.8 L1 8.6 L1 6.8 Z" />
      <path d="M8 2.5 L5 8.3 L8 10.2 L11 8.3 Z M8 10.2 V13.8 M5 8.3 L1 6.8 M11 8.3 L15 6.8" />
    </>
  ),
  12: (
    <path d="M8 1.3 L12.1 2.6 L14.7 6.1 L14.7 10.5 L12.1 14 L8 15.3 L3.9 14 L1.3 10.5 L1.3 6.1 L3.9 2.6 Z M8 4.6 L11.5 7.2 L10.2 11.3 L5.8 11.3 L4.5 7.2 Z M8 4.6 L8 1.3 M11.5 7.2 L14.7 6.1 M10.2 11.3 L12.1 14 M5.8 11.3 L3.9 14 M4.5 7.2 L1.3 6.1" />
  ),
  14: (
    <path d="M8 0.8 L13.2 6 L13.2 8.4 L8 15.2 L2.8 8.4 L2.8 6 Z M8 0.8 L6.2 9 L8 10.8 L9.8 9 Z M8 10.8 V15.2 M6.2 9 L2.8 8.4 M9.8 9 L13.2 8.4" />
  ),
  16: <path d="M8 0.8 L13 8 L8 15.2 L3 8 Z M8 0.8 L6.6 8 L8 15.2 L9.6 8 Z M3 8 H13" />,
  20: (
    <path d="M8 1 L14 4.5 L14 11.5 L8 15 L2 11.5 L2 4.5 Z M8 4.5 L12 11 L4 11 Z M2 4.5 L8 4.5 L14 4.5 L12 11 L8 15 L4 11 Z" />
  ),
  // d24: грани почти квадратные, кубик похож на шар из квадратов. В центре
  // грань лицом к зрителю, по сторонам сжатые перспективой соседи, в углах
  // маленькие грани.
  24: (
    <path d="M5.2 1.3 H10.8 L14.7 5.2 V10.8 L10.8 14.7 H5.2 L1.3 10.8 V5.2 Z M5.2 5.2 H10.8 V10.8 H5.2 Z M5.2 5.2 V1.3 M10.8 5.2 V1.3 M10.8 5.2 H14.7 M10.8 10.8 H14.7 M10.8 10.8 V14.7 M5.2 10.8 V14.7 M5.2 10.8 H1.3 M5.2 5.2 H1.3" />
  ),
  30: (
    <path d="M8 1 L12.5 2.8 L14.8 8 L12.5 13.2 L8 15 L3.5 13.2 L1.2 8 L3.5 2.8 Z M8 4 L11 8 L8 12 L5 8 Z M8 1 V4 M8 12 V15 M11 8 L14.8 8 M5 8 L1.2 8 M3.5 2.8 L5 8 M12.5 2.8 L11 8 M3.5 13.2 L5 8 M12.5 13.2 L11 8" />
  ),
}

/* Пара уменьшенных кубов внахлёст: d100 бросают двумя d10 (единицы и десятки),
   2d6 — двумя шестигранниками. Толщина линии поднята под уменьшение. */
const pair = (shape: JSX.Element) => (
  <>
    <g transform="translate(0 0.4) scale(0.72)" strokeWidth={1.8}>
      {shape}
    </g>
    <g transform="translate(8.5 4.8) scale(0.72)" strokeWidth={1.8}>
      {shape}
    </g>
  </>
)

/** Число граней для раскраски и иконки: «2d6» → 6, «d100» → 100. */
export const dieSides = (die: string): number | undefined => {
  const match = /^(\d*)d(\d+)$/.exec(die)
  return match ? Number(match[2]) : undefined
}

export const DieIcon = ({ die }: { die: string }) => {
  const match = /^(\d*)d(\d+)$/.exec(die)
  if (!match) return null
  const count = match[1] === "" ? 1 : Number(match[1])
  const sides = Number(match[2])

  const single = SHAPES[sides]
  const d10 = SHAPES[10]
  let content: JSX.Element | undefined
  let wide = true
  if (sides === 100 && count === 1 && d10) content = pair(d10)
  else if (count === 2 && single) content = pair(single)
  else if (count === 1 && single) {
    content = single
    wide = false
  }
  if (!content) return null

  return (
    <svg className={`die-icon${wide ? " die-icon--wide" : ""}`} viewBox={`0 0 ${wide ? 20 : 16} 16`} aria-hidden="true">
      {content}
    </svg>
  )
}
