import type { CSSProperties } from 'react'
import { Plus, ReceiptText, UserRound } from 'lucide-react'
import { useLedger } from '../data'
import { moneyFlow, categoryBreakdown, stateMonthTxs, summarize } from '../utils'
import { daysInMonth, formatMonth, greeting, todayStr } from '../utils'
import { formatMoneyShort, formatPercent } from '../utils'
import { EXPENSE_CATEGORIES, findCategory } from '../data'
import type { Tx } from '../types'
import { CategoryIcon, Empty, Money, Seal, SectionTitle, TxRow } from '../components'

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
  const todayTxs = state.txs.filter((t) => t.date === today)
  const todaySum = summarize(todayTxs)
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
  const projected = flow.available - flow.dailyAverage * daysInMonth(today)
  const over = projected < 0

  return (
    <div className="page home">
      <header className="home-head">
        <div className="brand">
          <Seal />
          <div>
            <h1>使劲燃的钱</h1>
            <p>{formatMonth(today)} · {greeting()}</p>
          </div>
        </div>
        <button className="avatar-btn" onClick={onGoMe} aria-label="我的" type="button">
          <UserRound size={19} strokeWidth={1.6} />
        </button>
      </header>

      <section className="hero" aria-label="本月可支配">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-top">
          <span>本月可支配</span>
          <span className="hero-pct">已用 {formatPercent(flow.spentPct)}</span>
        </div>
        <div className="hero-amount">
          <Money cents={flow.available} decimals="never" />
        </div>
        <p className="hero-note">
          月薪 ¥{formatMoneyShort(flow.salary)} · 固定 ¥{formatMoneyShort(flow.fixedCost)}，扣完才是能花的钱
        </p>
        <div className="hero-bar" aria-hidden="true">
          <i style={{ width: `${Math.min(100, Math.max(0, flow.spentPct))}%` }} />
        </div>
        <div className="hero-foot">
          <div>
            <span>日常已花</span>
            <b><Money cents={flow.spent} symbol={false} decimals="never" /></b>
          </div>
          <div>
            <span>还剩</span>
            <b><Money cents={Math.max(0, flow.remaining)} symbol={false} decimals="never" /></b>
          </div>
          <div>
            <span>每天可花</span>
            <b><Money cents={Math.max(0, flow.dailyAvailable)} symbol={false} decimals="never" /></b>
          </div>
        </div>
      </section>

      <div className="home-actions">
        <button className="action-main" onClick={onAdd} type="button">
          <span className="action-plus"><Plus size={20} strokeWidth={2.2} /></span>
          <span className="action-label">
            <b>记一笔</b>
            <small>随手记下，不费事</small>
          </span>
        </button>
        <button className="action-today" onClick={onGoStats} type="button">
          <span>今天</span>
          <b>{todaySum.count} 笔</b>
          <small><Money cents={todaySum.expense} symbol={false} decimals="never" /> 元</small>
        </button>
      </div>

      <section className="quick-block">
        <div className="quick-head">
          <span>常记</span>
          <button type="button" className="text-btn" onClick={onGoLedger}>全部</button>
        </div>
        <div className="quick-scroll">
          {quick.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="quick-chip"
              style={{ ['--cat' as string]: cat.color } as CSSProperties}
              onClick={() => onQuickAdd(cat.id)}
            >
              <span className="cat-tile">
                <CategoryIcon name={cat.icon} size={17} />
              </span>
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionTitle action="全部" onAction={onGoLedger}>最近记录</SectionTitle>
        {recent.length > 0 ? (
          <div className="card list-card">
            {recent.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                category={findCategory(state.categories, tx.categoryId)}
                showDate
                onClick={() => onEdit(tx)}
              />
            ))}
          </div>
        ) : (
          <div className="card">
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
          </div>
        )}
      </section>

      <section className={`pace-card ${over ? 'is-over' : ''}`}>
        <span className="pace-mark" aria-hidden="true">{over ? '紧' : '余'}</span>
        <div>
          {monthTxs.length === 0 ? (
            <p>这个月还没开始花钱，可支配的钱都还在。</p>
          ) : over ? (
            <p>照这个速度，月底会超支 <b>¥{Math.round(Math.abs(projected) / 100).toLocaleString('zh-CN')}</b>，要不要看看哪儿花多了？</p>
          ) : (
            <p>照现在的节奏，月底大约还能剩下 <b>¥{Math.round(projected / 100).toLocaleString('zh-CN')}</b>。</p>
          )}
          <span>
            按 {flow.daysElapsed} 天日均 ¥{(flow.dailyAverage / 100).toFixed(0)} 估算 · 本月已过 {flow.daysElapsed} 天
          </span>
        </div>
        <button type="button" className="pace-arrow" onClick={onGoStats} aria-label="查看统计">→</button>
      </section>

      <p className="home-quote">每一笔，都算数</p>
    </div>
  )
}
