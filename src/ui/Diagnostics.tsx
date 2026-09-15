import { useEffect, useState } from "preact/hooks"
import { getMiro, isInsideMiro, isPanelMode, probeUser, type BoardStatus } from "../board/sdk"
import { probeBoardStorage } from "../board/storage"

/**
 * Экран для разбора полётов: игрок открывает, жмёт «скопировать» и присылает
 * отчёт. Без него причина «у меня не грузится» выясняется угадайкой.
 */
interface Props {
  status: BoardStatus
}

type Rows = Array<[string, string]>

const pingSelf = async (): Promise<string> => {
  const started = performance.now()
  try {
    const response = await fetch(`${location.pathname}?ping=${Date.now()}`, { cache: "no-store" })
    const ms = Math.round(performance.now() - started)
    return `${response.status} за ${ms} мс`
  } catch (error) {
    return `недоступен (${(error as Error).message})`
  }
}

const swState = (): string => {
  if (!("serviceWorker" in navigator)) return "не поддерживается браузером"
  return navigator.serviceWorker.controller ? "активен, панель работает офлайн" : "не активен"
}

/**
 * Панель живёт в стороннем iframe внутри miro.com, а строгие настройки
 * приватности (Firefox, Safari, Brave, блокировщики) режут третьим сторонам
 * хранилище — причём обращение к localStorage не возвращает пустоту, а бросает
 * исключение. Для приложения, которое читает его на старте, это белый экран,
 * поэтому проверяем прямо и показываем текстом.
 */
const localStorageState = (): string => {
  const key = "__dice_probe"

  try {
    localStorage.setItem(key, "1")
    const readBack = localStorage.getItem(key) === "1"
    localStorage.removeItem(key)
    return readBack ? "доступно" : "не сохраняет значения"
  } catch (error) {
    return `заблокировано браузером (${(error as Error).name})`
  }
}

export const Diagnostics = ({ status }: Props) => {
  const [ping, setPing] = useState("проверяем…")
  const [boardStorage, setBoardStorage] = useState("проверяем…")
  const [player, setPlayer] = useState("проверяем…")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void pingSelf().then(setPing)
  }, [])

  useEffect(() => {
    void probeBoardStorage().then(setBoardStorage)
    void probeUser().then(setPlayer)
  }, [status])

  const rows: Rows = [
    ["Версия", `${__APP_VERSION__} от ${__BUILD_TIME__}`],
    ["Связь", status === "connected" ? "SDK подключён" : status === "loading" ? "подключаемся" : "SDK недоступен"],
    ["miro.js", getMiro() ? "загружен" : "не загружен"],
    ["Контекст", isInsideMiro() ? (isPanelMode() ? "панель в Miro" : "фоновый кадр в Miro") : "обычная вкладка"],
    ["Хостинг", location.origin],
    ["Отклик", ping],
    ["Игрок", player],
    ["Хранилище доски", boardStorage],
    ["Хранилище браузера", localStorageState()],
    ["Куки", navigator.cookieEnabled ? "разрешены" : "заблокированы для стороннего кадра"],
    ["Офлайн-кэш", swState()],
    ["Браузер", navigator.userAgent],
  ]

  const copy = (): void => {
    const report = rows.map(([key, value]) => `${key}: ${value}`).join("\n")
    void navigator.clipboard?.writeText(report).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div className="diag">
      {rows.map(([key, value]) => (
        <div key={key} className="diag__row">
          <span className="diag__key">{key}</span>
          <span className="diag__value">{value}</span>
        </div>
      ))}
      <button className="btn btn--ghost" onClick={copy}>
        {copied ? "скопировано" : "скопировать отчёт"}
      </button>
    </div>
  )
}
