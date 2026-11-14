import { ChartPie, House, ReceiptText, UserRound, Plus } from 'lucide-react'
import type { Tab } from '../types'

const TABS: { key: Tab; label: string; icon: typeof House }[] = [
  { key: 'home', label: '首页', icon: House },
  { key: 'ledger', label: '明细', icon: ReceiptText },
  { key: 'stats', label: '统计', icon: ChartPie },
  { key: 'me', label: '我的', icon: UserRound },
]

export function TabBar({ tab, onChange, onAdd }: { tab: Tab; onChange: (t: Tab) => void; onAdd: () => void }) {
  return (
    <nav className="tabbar" aria-label="主导航">
      {TABS.slice(0, 2).map((t) => (
        <TabButton key={t.key} tab={t} active={tab === t.key} onClick={() => onChange(t.key)} />
      ))}
      <div className="tab-add-wrap">
        <button className="tab-add" onClick={onAdd} aria-label="记一笔" type="button">
          <Plus size={26} strokeWidth={2} />
        </button>
      </div>
      {TABS.slice(2).map((t) => (
        <TabButton key={t.key} tab={t} active={tab === t.key} onClick={() => onChange(t.key)} />
      ))}
    </nav>
  )
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: { key: Tab; label: string; icon: typeof House }
  active: boolean
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <button
      className={`tab ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      type="button"
    >
      <Icon size={21} strokeWidth={active ? 1.9 : 1.6} />
      <span>{tab.label}</span>
    </button>
  )
}
