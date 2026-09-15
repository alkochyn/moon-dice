/**
 * Забирает иконки с game-icons.net и собирает из них src/data/icons.ts.
 *
 * Иконки встраиваются в бандл, а не грузятся с чужого хоста: панель не делает
 * ни одного внешнего запроса — ровно из-за такой ссылки на CDN не открывался
 * предыдущий кубомет. Запускается руками при изменении набора:
 *   node scripts/fetch-icons.mjs
 *
 * Источник — репозиторий game-icons/icons, лицензия CC BY 3.0, авторство
 * указано в README и в самой панели.
 */
import { writeFileSync } from "node:fs"

const BASE = "https://raw.githubusercontent.com/game-icons/icons/master"
/** Первый path в каждом файле — чёрная подложка, она нам не нужна. */
const BACKGROUND = "M0 0h512v512H0z"

const ICONS = `
skoll/spiked-ball
darkzaitzev/sharp-shuriken
lorc/bowman
lorc/battered-axe
lorc/battle-axe
lorc/barbed-spear
lorc/backstab
lorc/double-shot
lorc/crystal-wand
lorc/crossed-swords
lorc/crossed-sabres
lorc/fairy-wand
lorc/dripping-knife
lorc/harpoon-chain
lorc/mace-head
lorc/high-shot
lorc/heavy-arrow
lorc/scythe
lorc/slavery-whip
lorc/sparkling-sabre
lorc/spiked-mace
lorc/stiletto
lorc/stone-spear
lorc/trident
delapouite/flail
delapouite/crowbar
delapouite/sharp-axe
delapouite/sai
delapouite/skull-staff
delapouite/sword-brandish
delapouite/war-axe
delapouite/wood-club
delapouite/tomahawk
delapouite/war-pick
delapouite/warhammer
lorc/blade-bite
lorc/battle-gear
lorc/cloak-dagger
lorc/reaper-scythe
lorc/rogue
lorc/rune-sword
lorc/master-of-arms
lorc/relic-blade
delapouite/pirate-flag
delapouite/butterfly-knife
cathelineau/witch-face
skoll/balaclava
skoll/troll
lorc/barbute
lorc/beard
lorc/cultist
lorc/cowled
lorc/delighted
lorc/diamonds-smile
lorc/hood
lorc/iron-mask
lorc/pig-face
lorc/pumpkin-lantern
lorc/pumpkin-mask
lorc/pyromaniac
lorc/snake-bite
lorc/vomiting
lorc/triton-head
lorc/totem-head
lorc/swallow
lorc/wolf-head
delapouite/barbarian
delapouite/caesar
delapouite/dead-head
delapouite/dwarf-face
delapouite/eyepatch
delapouite/goblin-head
delapouite/metal-golem-head
delapouite/mustache
delapouite/pirate-captain
delapouite/overlord-helm
delapouite/orc-head
delapouite/police-officer-head
delapouite/robber-mask
delapouite/robot-helmet
delapouite/robot-antennas
delapouite/viking-head
delapouite/wizard-face
delapouite/woman-elf-face
delapouite/vampire-dracula
`
  .trim()
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)

/**
 * Пути берём как есть, только схлопываем пробелы.
 *
 * Округлять координаты нельзя: в путях game-icons сотни ОТНОСИТЕЛЬНЫХ команд,
 * и погрешность каждой накапливается вдоль контура — при округлении до одного
 * знака половина иконок превратилась в обрубки. Если размер снова станет
 * проблемой, резать нужно svgo: он считает накопленную ошибку, а не правит
 * числа регуляркой.
 */
const cleanPath = (d) => d.replace(/\s+/g, " ").trim()

const extractPaths = (svg) => {
  const found = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1])
  return found.filter((d) => d !== BACKGROUND).map(cleanPath)
}

const results = []
const failures = []

for (const id of ICONS) {
  const response = await fetch(`${BASE}/${id}.svg`)
  if (!response.ok) {
    failures.push(`${id}: HTTP ${response.status}`)
    continue
  }

  const svg = await response.text()
  const paths = extractPaths(svg)

  if (!paths.length) {
    failures.push(`${id}: не нашёл path`)
    continue
  }

  results.push({ id, name: id.split("/")[1], author: id.split("/")[0], d: paths.join(" ") })
  process.stdout.write(".")
}

process.stdout.write("\n")

if (failures.length) {
  console.error("Не скачались:\n  " + failures.join("\n  "))
  process.exit(1)
}

const authors = [...new Set(results.map((icon) => icon.author))].sort()
const body = results.map((icon) => `  ["${icon.name}", "${icon.d}"],`).join("\n")

const file = `/**
 * Иконки игроков. Сгенерировано scripts/fetch-icons.mjs — руками не править.
 *
 * Иконки с game-icons.net (${authors.join(", ")}), лицензия CC BY 3.0.
 * Встроены в бандл намеренно: панель не делает ни одного внешнего запроса.
 * Все рисуются в системе координат 512x512 и заливаются currentColor.
 */
export const ICON_VIEWBOX = "0 0 512 512"

export const ICON_AUTHORS = ${JSON.stringify(authors)} as const

/** id иконки -> данные пути. */
export const ICONS = new Map<string, string>([
${body}
])

export const ICON_IDS = [...ICONS.keys()]
`

writeFileSync("src/data/icons.ts", file)

const bytes = Buffer.byteLength(file, "utf8")
console.log(`Записано ${results.length} иконок, ${(bytes / 1024).toFixed(1)} КБ исходника`)
