import { useT } from "../i18n"
import { ChevronIcon, LinkIcon, RollIcon, StarIcon, SwordsIcon, WandIcon } from "./icons"

/** Что открыто в общей области над полем ввода: кубы, сохранённые броски или бой. */
export type Panel = "dice" | "mine" | "shared" | "combat"

interface Props {
  panel: Panel
  /** Набор DCC подписывает вкладку кубов по-своему: игрок видит, что открыт не стандарт. */
  dcc: boolean
  collapsed: boolean
  onPanelChange: (panel: Panel) => void
  onToggleCollapsed: () => void
}

/**
 * Кубы и сохранённые броски — одно и то же по смыслу: «чем кинуть одним
 * кликом». Поэтому они на одном уровне вкладками, а не двумя блоками друг
 * под другом: так в узкой панели остаётся больше места журналу.
 */
export const PanelTabs = ({ panel, dcc, collapsed, onPanelChange, onToggleCollapsed }: Props) => {
  const t = useT()

  const tab = (id: Panel, icon: preact.JSX.Element, label: string) => (
    <button
      className={`tab${panel === id ? " tab--active" : ""}`}
      role="tab"
      aria-selected={panel === id}
      onClick={() => {
        onPanelChange(id)
        // Клик по вкладке при свёрнутой области — явное желание её увидеть.
        if (collapsed) onToggleCollapsed()
      }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="panel-tabs">
      <div className="tabs" role="tablist">
        {tab("dice", dcc ? <WandIcon /> : <RollIcon />, dcc ? t.tabs.dccDice : t.tabs.dice)}
        {tab("mine", <StarIcon />, t.tabs.mine)}
        {tab("shared", <LinkIcon />, t.tabs.shared)}
        {tab("combat", <SwordsIcon />, t.tabs.combat)}
      </div>

      <button
        className="btn btn--ghost btn--icon panel-tabs__toggle"
        onClick={onToggleCollapsed}
        title={collapsed ? t.tabs.show : t.tabs.hide}
        aria-label={collapsed ? t.tabs.show : t.tabs.hide}
        aria-expanded={!collapsed}
      >
        <ChevronIcon className={collapsed ? "icon--flipped" : undefined} />
      </button>
    </div>
  )
}
