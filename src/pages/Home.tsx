import type { CSSProperties } from 'react'
import { Bookmark, ChevronRight, ReceiptText, Target } from 'lucide-react'
import { useLedger } from '../data'
import {
  categoryBreakdown,
  formatDay,
  formatMonth,
  formatPercent,
  moneyFlow,
  stateMonthTxs,
  todayStr,
  weekdayLabel,
} from '../utils'
import { EXPENSE_CATEGORIES, findCategory } from '../data'
import type { Tx } from '../types'
import { CategoryIcon, Empty, Money, Seal, TxRow } from '../components'

export function Home({
  onAdd,
  onEdit,
  onGoLedger,
  onGoStats,
  onGoMe,
  onQuickAdd,
}: {
  onAdd: () => void
  onEdit: (tx: Tx) => void
  onGoLedger: () => void
  onGoStats: () => void
  onGoMe: () => void
  onQuickAdd: (categoryId: string) => void
}) {
  const { state } = useLedger()
  const today = todayStr()
  const monthTxs = stateMonthTxs(state, today)
  const flow = moneyFlow(state.settings, monthTxs, today)
  const recent = [...state.txs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 5)
  const used = categoryBreakdown(monthTxs, state.categories, 'expense')
  const quick =
    used.length > 0
      ? [...used]
          .sort((a, b) => b.count - a.count || b.amount - a.amount)
          .slice(0, 4)
          .map((u) => u.category)
      : EXPENSE_CATEGORIES.slice(0, 4)

  const yuan = (cents: number) => Math.round(cents / 100).toLocaleString('zh-CN')
  const spentPct = Math.max(0, flow.spentPct)
  const fixedPct = flow.salary > 0 ? (flow.fixedCost / flow.salary) * 100 : 0
  const remainPct = flow.available > 0 ? (Math.max(0, flow.remaining) / flow.available) * 100 : 0
  const todayLabel = `${formatDay(today)} · ${weekdayLabel(today)}`

  return (
    <div className="page home">
      <header className="og-head">
        <div>
          <h1>使劲燃的钱</h1>
          <p>{todayLabel}</p>
        </div>
        <button className="og-avatar" onClick={onGoMe} aria-label="我的" type="button">
          <Seal />
        </button>
      </header>

      <section className="og-card" aria-label="本月预算">
        <div className="og-card-head">
          <span className="og-tile is-orange">
            <Target size={20} strokeWidth={1.9} />
          </span>
          <div className="og-card-copy">
            <span className="og-eyebrow">
              {formatMonth(today)} · 已用 {formatPercent(spentPct)}
            </span>
            <h2>本月预算</h2>
          </div>
          <button className="og-icon-btn" onClick={onGoStats} aria-label="查看统计" type="button">
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="og-meters">
          <div className="og-meter">
            <div className="og-meter-top">
              <span>日常支出</span>
              <b>
                ¥{yuan(flow.spent)} <em>/ ¥{yuan(flow.available)}</em>
              </b>
            </div>
            <i>
              <em style={{ width: `${Math.min(100, spentPct)}%` }} />
            </i>
          </div>
          <div className="og-meter">
            <div className="og-meter-top">
              <span>固定支出</span>
              <b>
                ¥{yuan(flow.fixedCost)} <em>/ ¥{yuan(flow.salary)}</em>
              </b>
            </div>
            <i>
              <em style={{ width: `${Math.min(100, fixedPct)}%` }} />
            </i>
          </div>
          <div className="og-meter is-green">
            <div className="og-meter-top">
              <span>本月还剩</span>
              <b>
                ¥{yuan(Math.max(0, flow.remaining))} <em>可用</em>
              </b>
            </div>
            <i>
              <em style={{ width: `${Math.min(100, Math.max(0, remainPct))}%` }} />
            </i>
          </div>
        </div>
      </section>

      <section className="og-card" aria-label="常记分类">
        <div className="og-card-head">
          <span className="og-tile is-blue">
            <Bookmark size={19} strokeWidth={1.9} />
          </span>
          <div className="og-card-copy">
            <span className="og-eyebrow">最常记</span>
            <h2>常记分类</h2>
          </div>
          <button className="og-link" onClick={onGoLedger} type="button">
            全部
          </button>
        </div>

        <div className="og-quick">
          {quick.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="og-quick-tile"
              onClick={() => onQuickAdd(cat.id)}
            >
              <span
                className="og-tile is-cat"
                style={{ ['--cat' as string]: cat.color } as CSSProperties}
              >
                <CategoryIcon name={cat.icon} size={19} />
              </span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="og-card list-card" aria-label="最近记录">
        <div className="og-card-head is-plain">
          <div className="og-card-copy">
            <span className="og-eyebrow">最近</span>
            <h2>流水</h2>
          </div>
          <button className="og-link" onClick={onGoLedger} type="button">
            全部
          </button>
        </div>
        {recent.length > 0 ? (
          recent.map((tx) => (
            <TxRow
              key={tx.id}
              tx={tx}
              category={findCategory(state.categories, tx.categoryId)}
              showDate
              onClick={() => onEdit(tx)}
            />
          ))
        ) : (
          <Empty
            icon={ReceiptText}
            title="还没有记过账"
            hint="第一笔，从今天的一杯咖啡开始。"
            action={
              <button className="btn-ghost sm" onClick={onAdd} type="button">
                记下第一笔
              </button>
            }
          />
        )}
      </section>

      <p className="og-footnote">每一笔，都算数</p>
    </div>
  )
}
