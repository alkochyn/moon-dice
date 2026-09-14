/**
 * Честный бросок: crypto.getRandomValues с отбрасыванием хвоста диапазона.
 * Math.random за игровым столом — вопрос доверия, а modulo без rejection
 * заметно перекашивает крупные кубы.
 */
export type Rng = (sides: number) => number

export const cryptoRng: Rng = (sides: number): number => {
  if (!Number.isInteger(sides) || sides < 1) {
    throw new RangeError(`Некорректное число граней: ${sides}`)
  }
  if (sides === 1) return 1

  const limit = Math.floor(0x1_0000_0000 / sides) * sides
  const buf = new Uint32Array(1)
  let x = 0
  do {
    globalThis.crypto.getRandomValues(buf)
    x = buf[0] as number
  } while (x >= limit)

  return (x % sides) + 1
}
