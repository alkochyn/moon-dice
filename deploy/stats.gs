/**
 * Приёмник статистики кубомета: Apps Script, привязанный к Google Таблице.
 *
 * Панель шлёт сюда POST с JSON (text/plain, чтобы браузер обошёлся без
 * preflight), скрипт дописывает строку в лист events. Лист summary считает
 * сводку формулами — его создаёт setup().
 *
 * Установка — в README, раздел «Статистика».
 */

const EVENTS = "events"
const SUMMARY = "summary"
const HEADER = ["ts", "month", "ev", "board", "user", "team", "version", "lang", "skin", "dice", "initiative", "tables"]
// ts и month — даты, счётчики — числа, остальное строго текст: хэш из одних
// цифр таблица иначе превратила бы в число и потеряла бы его хвост.
const FORMATS = ["yyyy-mm-dd hh:mm:ss", "yyyy-mm", "@", "@", "@", "@", "@", "@", "@", "0", "0", "0"]
const EVENT_TYPES = ["board", "panel", "rolls"]
const MAX_TEXT = 32
const MAX_COUNT = 10000

const text = (value) => (typeof value === "string" ? value.slice(0, MAX_TEXT) : "")
const count = (value) => (Number.isInteger(value) && value >= 0 ? Math.min(value, MAX_COUNT) : 0)

function doPost(e) {
  let data
  try {
    data = JSON.parse(e.postData.contents)
  } catch (error) {
    return ContentService.createTextOutput("bad json")
  }
  if (!data || !EVENT_TYPES.includes(data.ev) || !text(data.board)) {
    return ContentService.createTextOutput("bad event")
  }

  const now = new Date()
  const row = [
    now,
    new Date(now.getFullYear(), now.getMonth(), 1),
    data.ev,
    text(data.board),
    text(data.user),
    text(data.team),
    text(data.version),
    text(data.lang),
    text(data.skin),
    count(data.dice),
    count(data.initiative),
    count(data.tables),
  ]

  // Строку пишем сами, а не appendRow: так можно задать формат до значений.
  // Замок — чтобы два одновременных события не легли в одну строку.
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(10000)) return ContentService.createTextOutput("busy")

  try {
    const sheet = eventsSheet()
    const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADER.length)
    range.setNumberFormats([FORMATS]).setValues([row])
  } finally {
    lock.releaseLock()
  }

  return ContentService.createTextOutput("ok")
}

function eventsSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = book.getSheetByName(EVENTS)
  if (!sheet) {
    sheet = book.insertSheet(EVENTS)
    sheet.appendRow(HEADER)
    sheet.setFrozenRows(1)
  }
  return sheet
}

/** Запустить один раз руками из редактора: создаёт оба листа. */
function setup() {
  eventsSheet()

  const book = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = book.getSheetByName(SUMMARY) || book.insertSheet(SUMMARY)
  sheet.clear()

  // Столбцы events: A ts, B month, C ev, D board, E user, F team, J..L броски.
  const unique = (column, extra) =>
    `=IFERROR(COUNTUNIQUE(FILTER(events!${column}2:${column}, events!${column}2:${column}<>""${extra || ""})), 0)`
  const recent = ", events!A2:A>=NOW()-30"
  const opens = (ev) => `=COUNTIFS(events!C2:C, "${ev}", events!A2:A, ">="&(NOW()-30))`
  const rolls = (column) => `SUMIFS(events!${column}2:${column}, events!A2:A, ">="&(NOW()-30))`

  const metrics = [
    ["Метрика", "Значение"],
    ["Досок всего", unique("D")],
    ["Команд всего", unique("F")],
    ["Игроков всего", unique("E")],
    ["Активных досок за 30 дней", unique("D", recent)],
    ["Активных игроков за 30 дней", unique("E", recent)],
    ["Открытий доски с панелью за 30 дней", opens("board")],
    ["Открытий самой панели за 30 дней", opens("panel")],
    ["Бросков кубов за 30 дней", `=${rolls("J")}`],
    ["Инициатив за 30 дней", `=${rolls("K")}`],
    ["Бросков по таблицам за 30 дней", `=${rolls("L")}`],
  ]
  sheet.getRange(1, 1, metrics.length, 2).setValues(metrics)

  // Помесячно — ради порога маркетплейса: >50 MAU два месяца подряд.
  const top = metrics.length + 2
  const byMonth = (column) =>
    `=MAP(A${top + 1}:A, LAMBDA(m, IF(m="", "", COUNTUNIQUEIFS(events!${column}2:${column}, events!B2:B, m, events!${column}2:${column}, "<>"))))`
  const monthly = [
    [
      "Месяц",
      "MAU",
      "Активных досок",
      "Активных команд",
      "Открытий панели",
      "Бросков всего",
    ],
    [
      `=SORT(UNIQUE(FILTER(events!B2:B, events!B2:B<>"")), 1, FALSE)`,
      byMonth("E"),
      byMonth("D"),
      byMonth("F"),
      `=MAP(A${top + 1}:A, LAMBDA(m, IF(m="", "", COUNTIFS(events!B2:B, m, events!C2:C, "panel"))))`,
      `=MAP(A${top + 1}:A, LAMBDA(m, IF(m="", "", SUMIFS(events!J2:J, events!B2:B, m) + SUMIFS(events!K2:K, events!B2:B, m) + SUMIFS(events!L2:L, events!B2:B, m))))`,
    ],
  ]
  sheet.getRange(top, 1, monthly.length, monthly[0].length).setValues(monthly)
  sheet.getRange(top + 1, 1, 200, 1).setNumberFormat("yyyy-mm")

  sheet.getRange(1, 1, 1, 2).setFontWeight("bold")
  sheet.getRange(top, 1, 1, monthly[0].length).setFontWeight("bold")
  sheet.autoResizeColumns(1, monthly[0].length)
}
