import type { BoardStatus } from "../board/sdk"
import { useT } from "../i18n"

interface Props {
  status: BoardStatus
}

/**
 * Строка статуса показывается, только когда есть что сказать: в обычной работе
 * «На доске» занимало место в самой тесной части панели и не сообщало ничего
 * нового. А вот про локальный режим игрок знать обязан — иначе он уверен, что
 * партия видит его броски, а они остались в одном браузере.
 */
export const StatusBar = ({ status }: Props) => {
  const t = useT()
  if (status === "connected") return null

  return (
    <div className="status">
      <span className={`status__dot status__dot--${status}`} />
      <span>{t.status[status]}</span>
    </div>
  )
}
