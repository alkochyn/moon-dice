import type { JSX } from "preact"

import { dieSides } from "./DieIcon"

/*
 * Оттенок каждого куба подобран вручную. Плавная шкала по числу граней
 * давала соседям в цепочке DCC (d4, d5, d6, d7) почти одинаковый цвет, а
 * здесь соседи по цепочке всегда заметно различаются. Оттенок привязан к
 * кубу, а не к месту в наборе: d20 синий и в стандартном наборе, и в DCC,
 * и глаз со временем находит куб по цвету, не читая надпись.
 */
const DIE_HUES: Record<number, number> = {
  2: 300,
  3: 160,
  4: 0,
  5: 80,
  6: 28,
  7: 250,
  8: 46,
  10: 140,
  12: 180,
  14: 330,
  16: 100,
  20: 220,
  24: 15,
  30: 195,
  100: 275,
}

/** Все оттенки палитры кубов — из них кнопка броска берёт свой цвет. */
export const PALETTE_HUES: number[] = [...new Set(Object.values(DIE_HUES))]

/** Стиль кнопки куба: оттенок уходит в --h, остальное считает CSS. */
export const dieStyle = (die: string): JSX.CSSProperties | undefined => {
  const sides = dieSides(die)
  if (!sides || sides < 2) return undefined
  // Куб не из таблицы (d7 в формуле — не повод падать) берёт оттенок по шкале.
  const hue = DIE_HUES[sides] ?? Math.round((Math.log(sides / 2) / Math.log(50)) * 285)
  return { "--h": hue } as JSX.CSSProperties
}
