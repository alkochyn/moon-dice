import { describe, expect, it } from "vitest"

import { mergeTables, readInputValues, readSharedTable, type SharedTable } from "./tables"

const table = (id: string): SharedTable => ({ id, generator: `gen-${id}`, title: id, lists: [""], inputs: [] })

describe("общие таблицы", () => {
  it("из старой копии берёт общую часть, а личный выбор отбрасывает", () => {
    const stored = {
      id: "a",
      generator: "dcc-fumbles",
      title: "DCC Fumbles",
      list: "d8",
      lists: ["", "d8"],
      values: { luckInput: "-1" },
    }
    expect(readSharedTable(stored)).toEqual({
      id: "a",
      generator: "dcc-fumbles",
      title: "DCC Fumbles",
      lists: ["", "d8"],
      inputs: [],
    })
  })

  it("битые записи с доски не проходят", () => {
    expect(readSharedTable(null)).toBeNull()
    expect(readSharedTable({ id: "a", generator: "g", title: "t" })).toBeNull()
    expect(readSharedTable({ ...table("a"), inputs: [{ name: "x" }, { name: "luck", label: "Luck" }] })?.inputs).toEqual(
      [{ name: "luck", label: "Luck" }],
    )
  })

  it("свои таблицы встают после общих, без дублей", () => {
    expect(mergeTables([table("a"), table("b")], [table("b"), table("c")]).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("введённое в поля — только строки", () => {
    expect(readInputValues({ luck: "-1", level: 3, name: null })).toEqual({ luck: "-1" })
    expect(readInputValues(["x"])).toEqual({})
    expect(readInputValues(undefined)).toEqual({})
  })
})
