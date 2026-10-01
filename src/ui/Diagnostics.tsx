import { useEffect, useState } from "preact/hooks"
import { getMiro, isInsideMiro, isPanelMode, probeUser, type BoardStatus } from "../board/sdk"
import { probeBoardStorage } from "../board/storage"
import { countLiveUpdates, describeBoardLog } from "../board/log"
import { useT, type Strings } from "../i18n"

/**
 * Экран для разбора полётов: игрок открывает, жмёт «скопировать» и присылает
 * отчёт. Без него причина «у меня не грузится» выясняется угадайкой.
 */
interface Props {
  status: BoardStatus
}

type Rows = Array<[string, string]>

type Diag = Strings["diag"]

const pingSelf = async (d: Diag): Promise<string> => {
  const started = performance.now()
  try {
    const response = await fetch(`${location.pathname}?ping=${Date.now()}`, { cache: "no-store" })
    const ms = Math.round(performance.now() - started)
    return d.pingValue(response.status, ms)
  } catch (error) {
    return d.pingFailed((error as Error).message)
  }
}

const swState = (d: Diag): string => {
  if (!("serviceWorker" in navigator)) return d.swUnsupported
  return navigator.serviceWorker.controller ? d.swActive : d.swInactive
}

/**
 * Панель живёт в стороннем iframe внутри miro.com, а строгие настройки
 * приватности (Firefox, Safari, Brave, блокировщики) режут третьим сторонам
 * хранилище — причём обращение к localStorage не возвращает пустоту, а бросает
 * исключение. Для приложения, которое читает его на старте, это белый экран,
 * поэтому проверяем прямо и показываем текстом.
 */
const localStorageState = (d: Diag): string => {
  const key = "__dice_probe"

  try {
    localStorage.setItem(key, "1")
    const readBack = localStorage.getItem(key) === "1"
    localStorage.removeItem(key)
    return readBack ? d.storageOk : d.storageNotSaving
  } catch (error) {
    return d.storageBlocked((error as Error).name)
  }
}

export const Diagnostics = ({ status }: Props) => {
  const t = useT()
  const d = t.diag
  const [ping, setPing] = useState(d.checking)
  const [boardStorage, setBoardStorage] = useState(d.checking)
  const [player, setPlayer] = useState(d.checking)
  const [boardLog, setBoardLog] = useState(d.checking)
  const [live, setLive] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void pingSelf(d).then(setPing)
  }, [d])

  useEffect(() => {
    void probeBoardStorage(d).then(setBoardStorage)
    void probeUser(d).then(setPlayer)
    void describeBoardLog(d, t.locale).then(setBoardLog)
    setLive(countLiveUpdates())
  }, [d, status, t.locale])

  const rows: Rows = [
    [d.version, d.versionValue(__APP_VERSION__, __BUILD_TIME__)],
    [d.connection, status === "connected" ? d.sdkConnected : status === "loading" ? d.sdkConnecting : d.sdkUnavailable],
    [d.miroJs, getMiro() ? d.loaded : d.notLoaded],
    [d.context, isInsideMiro() ? (isPanelMode() ? d.contextPanel : d.contextBackground) : d.contextTab],
    [d.hosting, location.origin],
    [d.ping, ping],
    [d.player, player],
    [d.boardStorage, boardStorage],
    [d.boardLog, boardLog],
    [d.liveUpdates, live ? d.liveValue(live) : d.liveNone],
    [d.browserStorage, localStorageState(d)],
    [d.cookies, navigator.cookieEnabled ? d.cookiesOn : d.cookiesOff],
    [d.offlineCache, swState(d)],
    [d.browser, navigator.userAgent],
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
        {copied ? d.copied : d.copy}
      </button>
    </div>
  )
}
