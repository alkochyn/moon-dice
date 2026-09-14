import type { BoardStatus } from "../board/sdk"

interface Props {
  status: BoardStatus
  userName?: string
  diagnosticsOpen: boolean
  onToggleDiagnostics: () => void
}

const LABELS: Record<BoardStatus, string> = {
  loading: "Подключаемся к доске…",
  connected: "На доске",
  offline: "Локальный режим — броски не уходят в общий журнал",
}

export const StatusBar = ({ status, userName, diagnosticsOpen, onToggleDiagnostics }: Props) => (
  <div className="status">
    <span className={`status__dot status__dot--${status}`} />
    <span>
      {LABELS[status]}
      {status === "connected" && userName ? ` · ${userName}` : ""}
    </span>
    <span className="status__spacer" />
    <button className="status__link" onClick={onToggleDiagnostics}>
      {diagnosticsOpen ? "скрыть" : "диагностика"}
    </button>
  </div>
)
