import { describe, expect, it } from "vitest"

import { fetchBundle, generatorTitle, listChoices, parseGeneratorName, PerchanceError, rollList } from "."
import { article, htmlToText, pluralForm, singularForm, titleCase } from "./text"

/** Предсказуемый генератор: тесты не должны мигать. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const roll = (code: string, list = "", seed = 1, extra: Record<string, string> = {}): string =>
  rollList({ name: "main", sources: { main: code, ...extra } }, list, seeded(seed))

/** Все варианты, которые выпадают за много бросков. */
const outcomes = (code: string, list = "", times = 200, extra: Record<string, string> = {}): Set<string> =>
  new Set(Array.from({ length: times }, (_, index) => roll(code, list, index + 1, extra)))

const failure = (run: () => unknown): PerchanceError => {
  try {
    run()
  } catch (error) {
    if (error instanceof PerchanceError) return error
    throw error
  }
  throw new Error("не упало")
}

describe("списки", () => {
  it("выбирает из списка output", () => {
    expect(outcomes("output\n  goblin\n  orc\n\tkobold")).toEqual(new Set(["goblin", "orc", "kobold"]))
  })

  it("вес 0 не выпадает никогда, а [выражение] в весе считается", () => {
    const code = "output\n  common ^5\n  never ^0\n  flag ^[x == 1]\n"
    expect(outcomes(code)).toEqual(new Set(["common"]))
    expect(outcomes("output\n  [x = 1, \"\"]{yes ^[x == 1]|no ^[x == 2]}")).toEqual(new Set(["yes"]))
  })

  it("подставляет ссылки на другие списки и вложенные списки", () => {
    const code = "output\n  [beast]\n\nbeast\n  wolf\n    grey wolf\n  bear\n    cave bear\n"
    expect(outcomes(code)).toEqual(new Set(["grey wolf", "cave bear"]))
  })

  it("комментарии убирает, адреса и экранированные слеши оставляет", () => {
    expect(roll("output // список\n  see https://perchance.org \\/\\/ ok // хвост")).toBe(
      "see https://perchance.org // ok",
    )
  })

  it("свойства name = value и свойства вложенных списков", () => {
    const code = [
      "output",
      "  [r = race.selectOne, r.name] ростом [r.height]",
      "race",
      "  dwarf",
      "    name = Гном",
      "    height = 4",
    ].join("\n")
    expect(roll(code)).toBe("Гном ростом 4")
  })

  it("$output на корне и this.joinItems в списке", () => {
    expect(roll("$output = [a.joinItems(\", \")]\na\n  x\n  y")).toBe("x, y")
    expect(roll("output\n  [d]\nd\n  one\n  two\n  $output = <p>[this.joinItems(\"</p><p>\")]</p>")).toBe("one\ntwo")
  })
})

describe("фигурные скобки", () => {
  it("выбор, диапазон и буквы", () => {
    expect(outcomes("output\n  {red|blue}")).toEqual(new Set(["red", "blue"]))
    const numbers = [...outcomes("output\n  {1-3}")].map(Number).sort()
    expect(numbers).toEqual([1, 2, 3])
    expect([...outcomes("output\n  {a-c}")].sort()).toEqual(["a", "b", "c"])
  })

  it("артикль по следующему слову, в том числе из подстановки", () => {
    expect(roll("output\n  {A} [x]\nx\n  owl")).toBe("An owl")
    expect(roll("output\n  {a} [x]\nx\n  unicorn")).toBe("a unicorn")
    expect(roll("output\n  {a} hour")).toBe("an hour")
  })

  it("{s} смотрит на число перед собой", () => {
    expect(roll("output\n  1 coin{s}")).toBe("1 coin")
    expect(roll("output\n  3 coin{s}")).toBe("3 coins")
  })

  it("вес у варианта внутри скобок", () => {
    expect(outcomes("output\n  {often^5|never^0}")).toEqual(new Set(["often"]))
  })
})

describe("выражения", () => {
  it("selectOne запоминает выбор в переменной", () => {
    expect(outcomes("output\n  [g = gender.selectOne] и снова [g]\ngender\n  He\n  She")).toEqual(
      new Set(["He и снова He", "She и снова She"]),
    )
  })

  it("consumableList не повторяет строки", () => {
    for (const result of outcomes("output\n  [c = gem.consumableList] [c] [c]\ngem\n  ruby\n  jade\n  opal", "", 50)) {
      expect(new Set(result.split(" ")).size).toBe(3)
    }
  })

  it("selectMany, selectUnique и joinItems", () => {
    expect(roll("output\n  [x.selectMany(3).joinItems(\"-\")]\nx\n  a")).toBe("a-a-a")
    const unique = roll("output\n  [x.selectUnique(3).joinItems(\"\")]\nx\n  a\n  b\n  c")
    expect([...unique].sort().join("")).toBe("abc")
  })

  it("счётчики, сравнения и тернарный оператор", () => {
    expect(roll('output\n  [s = 0, ""][s = s + 10, ""][s > 5 ? "много" : "мало"]')).toBe("много")
    expect(roll("output\n  [n = 2, n * 3 + 1]")).toBe("7")
  })

  it("вес посреди строки с выражением после него", () => {
    expect(outcomes('output\n  gold^5[s = 1, ""]\n  lead^0')).toEqual(new Set(["gold"]))
  })

  it("регистр и множественное число", () => {
    expect(roll("output\n  [x.titleCase] [y.pluralForm]\nx\n  lost city\ny\n  wolf")).toBe("Lost City wolves")
  })
})

describe("импорты", () => {
  const extra = { beasts: "output\n  wolf\nsize\n  huge" }

  it("{import:…} как свойство и доступ к его спискам", () => {
    expect(roll("b = {import:beasts}\noutput\n  [b] [b.size]", "", 1, extra)).toBe("wolf huge")
  })

  it("{import:…} прямо в тексте", () => {
    expect(roll("output\n  a {import:beasts}", "", 1, extra)).toBe("a wolf")
  })

  it("недостающий импорт — понятная ошибка", () => {
    expect(failure(() => roll("output\n  {import:nope}")).code).toBe("importMissing")
  })
})

describe("ошибки", () => {
  it("неизвестное имя", () => {
    const error = failure(() => roll("output\n  [missing]"))
    expect(error.code).toBe("unknownName")
    expect(error.detail).toBe("missing")
  })

  it("JS, который мы не исполняем", () => {
    expect(failure(() => roll("output\n  [window.alert(1)]")).code).toBe("unsupported")
    expect(failure(() => roll("output\n  [(() => 1)()]")).code).toBe("unsupported")
    expect(failure(() => roll("plugin = {import:p}\noutput\n  [plugin(1)]", "", 1, { p: "x\n  y" })).code).toBe(
      "notCallable",
    )
  })

  it("самоссылка не вешает панель", () => {
    expect(failure(() => roll("output\n  [output] и ещё")).code).toBe("tooDeep")
  })

  it("без output и без $output", () => {
    expect(failure(() => roll("things\n  a")).code).toBe("noOutput")
  })
})

describe("что предлагать кинуть", () => {
  it("главный вывод, списки — без настроек страницы и функций", () => {
    const code = [
      "title = Лут",
      "description",
      "  текст",
      "helper(x) =>",
      "  return x",
      "output",
      "  [loot]",
      "loot",
      "  меч",
      "settings",
      "  size = 3",
    ].join("\n")
    const bundle = { name: "main", sources: { main: code } }
    expect(listChoices(bundle)).toEqual(["", "loot"])
    expect(generatorTitle(bundle)).toBe("Лут")
  })

  it("без output — только списки", () => {
    expect(listChoices({ name: "main", sources: { main: "a\n  x\nb\n  y" } })).toEqual(["a", "b"])
  })
})

describe("текст", () => {
  it("HTML превращается в строки, теги и сущности уходят", () => {
    expect(htmlToText("<b>Orc</b> &amp; elf<br>line two<hr>x &lt; 5 &#8212; ok")).toBe(
      "Orc & elf\nline two\nx < 5 — ok",
    )
    expect(htmlToText('<img src="x" onerror="alert(1)">safe')).toBe("safe")
  })

  it("английская морфология на частых случаях", () => {
    expect(pluralForm("box")).toBe("boxes")
    expect(pluralForm("city")).toBe("cities")
    expect(pluralForm("Dwarf")).toBe("Dwarves")
    expect(pluralForm("гоблин")).toBe("гоблин")
    expect(singularForm("knives")).toBe("knife")
    expect(article("elf")).toBe("an")
    expect(article("European")).toBe("a")
    expect(titleCase("the lost city")).toBe("The Lost City")
  })
})

describe("ссылка на генератор", () => {
  it("принимает ссылку, ссылку встраивания и голое имя", () => {
    expect(parseGeneratorName("https://perchance.org/dnd-npc")).toBe("dnd-npc")
    expect(parseGeneratorName("perchance.org/dnd-npc?x=1#edit")).toBe("dnd-npc")
    expect(parseGeneratorName("https://abc123.perchance.org/rpg-loot")).toBe("rpg-loot")
    expect(parseGeneratorName("  tavern-name ")).toBe("tavern-name")
    expect(parseGeneratorName("https://example.com/x")).toBeNull()
    expect(parseGeneratorName("two words")).toBeNull()
  })

  it("сервер не знает генератор — notFound", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ success: true, generators: {}, unfound: ["nope"] }))) as typeof fetch
    await expect(fetchBundle("nope", fake)).rejects.toMatchObject({ code: "notFound" })
  })

  it("забирает код главного генератора и его импортов", async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({ success: true, generators: { main: { code: "output\n  a" }, dep: { code: "x" } } }),
      )) as typeof fetch
    const bundle = await fetchBundle("main", fake)
    expect(bundle.sources).toEqual({ main: "output\n  a", dep: "x" })
  })
})
