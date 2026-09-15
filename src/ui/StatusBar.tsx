import type { BoardStatus } from "../board/sdk"

interface Props {
  status: BoardStatus
  displayName?: string
  diagnosticsOpen: boolean
  onToggleDiagnostics: () => void
  onOpenSettings: () => void
}

const LABELS: Record<BoardStatus, string> = {
  loading: "Подключаемся к доске…",
  connected: "На доске",
  offline: "Локальный режим — броски не уходят в общий журнал",
}

export const StatusBar = ({ status, displayName, diagnosticsOpen, onToggleDiagnostics, onOpenSettings }: Props) => (
  <div className="status">
    <span className={`status__dot status__dot--${status}`} />
    <span>
      {LABELS[status]}
      {status === "connected" && displayName ? ` · ${displayName}` : ""}
    </span>
    <span className="status__spacer" />
    <button className="status__link" onClick={onToggleDiagnostics}>
      {diagnosticsOpen ? "скрыть" : "диагностика"}
    </button>
    <button className="btn btn--ghost btn--icon" onClick={onOpenSettings} title="Настройки игрока" aria-label="Настройки игрока">
      ⚙
    </button>
  </div>
)
