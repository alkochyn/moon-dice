/**
 * Текстовые превращения perchance: регистр, артикль, множественное число и
 * перевод HTML результата в простой текст для журнала.
 *
 * Английская морфология здесь грубая, на правилах: perchance тянет для этого
 * целую библиотеку на 360 КБ, а таблицам хватает частых случаев. Кириллицу
 * не трогаем вовсе — русское множественное число правилами не взять.
 */

export const titleCase = (text: string): string => text.replace(/(^|[\s(«"-])(\p{L})/gu, (_, gap, ch) => gap + ch.toUpperCase())

export const sentenceCase = (text: string): string => text.replace(/\p{L}/u, (ch) => ch.toUpperCase())

const IRREGULAR: Record<string, string> = {
  man: "men",
  woman: "women",
  child: "children",
  person: "people",
  foot: "feet",
  tooth: "teeth",
  goose: "geese",
  mouse: "mice",
  louse: "lice",
  ox: "oxen",
  die: "dice",
  sheep: "sheep",
  fish: "fish",
  deer: "deer",
  moose: "moose",
  elk: "elk",
  bison: "bison",
  swine: "swine",
  series: "series",
  species: "species",
  dwarf: "dwarves",
  elf: "elves",
  wolf: "wolves",
  half: "halves",
  calf: "calves",
  leaf: "leaves",
  loaf: "loaves",
  shelf: "shelves",
  thief: "thieves",
  knife: "knives",
  wife: "wives",
  life: "lives",
  cactus: "cacti",
  potato: "potatoes",
  tomato: "tomatoes",
  hero: "heroes",
  echo: "echoes",
  torpedo: "torpedoes",
  volcano: "volcanoes",
}

const IRREGULAR_BACK = Object.fromEntries(Object.entries(IRREGULAR).map(([one, many]) => [many, one]))

/** Повторяет регистр образца: «Wolf» → «Wolves», «WOLF» → «WOLVES». */
const matchCase = (sample: string, word: string): string => {
  if (sample.length > 1 && sample === sample.toUpperCase()) return word.toUpperCase()
  if (sample[0] && sample[0] !== sample[0].toLowerCase()) return word[0]!.toUpperCase() + word.slice(1)
  return word
}

/** Меняет последнее латинское слово фразы: «suit of armor» множится не так, но такие фразы в таблицах редки. */
const lastWord = (text: string, change: (lower: string) => string): string => {
  const match = /([A-Za-z]+)([^A-Za-z]*)$/.exec(text)
  if (!match || /\p{Script=Cyrillic}/u.test(text)) return text

  const word = match[1]!
  return text.slice(0, match.index) + matchCase(word, change(word.toLowerCase())) + match[2]
}

export const pluralForm = (text: string): string =>
  lastWord(text, (word) => {
    if (IRREGULAR[word]) return IRREGULAR[word]!
    if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`
    if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`
    return `${word}s`
  })

export const singularForm = (text: string): string =>
  lastWord(text, (word) => {
    if (IRREGULAR_BACK[word]) return IRREGULAR_BACK[word]!
    if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`
    if (/(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2)
    if (/[^s]s$/.test(word)) return word.slice(0, -1)
    return word
  })

/** «a» или «an» по звучанию следующего слова, а не по букве: an hour, a unicorn, an 8. */
export const article = (next: string): "a" | "an" => {
  const word = next.trimStart().toLowerCase()
  if (/^(hour|honest|honou?r|heir)/.test(word)) return "an"
  if (/^(uni|use|usu|ute|uti|eu|ewe|one|once|ur[aeiou])/.test(word)) return "a"
  if (/^(8|11|18|8\d)(\D|$)/.test(word)) return "an"
  return /^[aeiou]/.test(word) ? "an" : "a"
}

/** Маркеры артиклей: решаются, только когда известен текст после них. */
export const ARTICLE_LOWER = "\u0001"
export const ARTICLE_UPPER = "\u0002"
const ARTICLE_RE = /[\u0001\u0002]/

/**
 * Подставляет артикли, после которых уже есть слово. Висящий в конце маркер
 * остаётся: следующее слово придёт из внешнего шаблона.
 */
export const resolveArticles = (text: string, final = false): string => {
  if (!ARTICLE_RE.test(text)) return text

  let out = ""
  for (let index = 0; index < text.length; index++) {
    const ch = text[index]!
    if (ch !== ARTICLE_LOWER && ch !== ARTICLE_UPPER) {
      out += ch
      continue
    }

    const rest = text.slice(index + 1).replace(/<[^>]*>/g, "").replace(/[\u0001\u0002]/g, "")
    if (!/\S/.test(rest) && !final) {
      out += ch
      continue
    }

    const chosen = article(rest)
    out += ch === ARTICLE_UPPER ? chosen[0]!.toUpperCase() + chosen.slice(1) : chosen
  }

  return out
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

/**
 * Результат perchance — это HTML. В журнал и на стикер идёт простой текст:
 * переносы строк остаются, теги уходят. Вставлять HTML чужого генератора в
 * панель как есть нельзя — это готовая дыра.
 */
export const htmlToText = (html: string): string =>
  html
    // Абзац <p>…</p> — одна строка, а не строка с пустой перед ней.
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>|<\/?(div|li|ul|ol|h[1-6]|tr|table)\b[^>]*>|<\/p>|<hr\b[^>]*>/gi, "\n")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const value = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : whole
      }
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
