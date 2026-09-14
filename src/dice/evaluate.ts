import { DiceError, type Die, type EvalNode, type Node } from "./types"
import { cryptoRng, type Rng } from "./random"

const MAX_EXPLOSIONS = 100

const rollDice = (count: number, sides: number, explode: boolean, rng: Rng): Die[] => {
  const dice: Die[] = []

  for (let i = 0; i < count; i++) {
    const chain: number[] = [rng(sides)]

    if (explode) {
      while (chain[chain.length - 1] === sides && chain.length < MAX_EXPLOSIONS) {
        chain.push(rng(sides))
      }
    }

    dice.push({ chain, value: chain.reduce((sum, n) => sum + n, 0), kept: true })
  }

  return dice
}

const applyKeep = (dice: Die[], mode: "h" | "l", n: number): void => {
  const order = dice
    .map((die, index) => ({ index, value: die.value }))
    .sort((a, b) => (mode === "h" ? b.value - a.value : a.value - b.value))

  for (const { index } of order.slice(n)) {
    ;(dice[index] as Die).kept = false
  }
}

export const evaluate = (node: Node, rng: Rng = cryptoRng): EvalNode => {
  switch (node.kind) {
    case "num":
      return { kind: "num", value: node.value, paren: node.paren }

    case "dice": {
      const dice = rollDice(node.count, node.sides, node.explode, rng)
      if (node.keep) {
        applyKeep(dice, node.keep.mode, node.keep.n)
      }
      const value = dice.reduce((sum, die) => (die.kept ? sum + die.value : sum), 0)

      return { kind: "dice", value, dice, paren: node.paren }
    }

    case "unary": {
      const operand = evaluate(node.operand, rng)
      return { kind: "unary", operand, value: -operand.value, paren: node.paren }
    }

    case "binary": {
      const left = evaluate(node.left, rng)
      const right = evaluate(node.right, rng)
      let value: number

      switch (node.op) {
        case "+":
          value = left.value + right.value
          break
        case "-":
          value = left.value - right.value
          break
        case "*":
          value = left.value * right.value
          break
        case "/":
          if (right.value === 0) throw new DiceError("Деление на ноль")
          // Округление вниз — привычная для НРИ конвенция.
          value = Math.floor(left.value / right.value)
          break
      }

      return { kind: "binary", op: node.op, left, right, value, paren: node.paren }
    }
  }
}
