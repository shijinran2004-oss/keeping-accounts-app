import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Plus,
  ReceiptText,
  Target,
} from 'lucide-react'
import { useLedger } from '../data'
import {
  addDays,
  addMonths,
  categoryBreakdown,
  dailySeries,
  daysInMonth,
  eachDay,
  formatDay,
  formatMoneyShort,
  formatMonth,
  formatPercent,
  inRange,
  moneyFlow,
  monthRange,
  parseDate,
  startOfWeek,
  stateMonthTxs,
  sumAmount,
  summarize,
  todayStr,
  weekdayLabel,
  weekdayShort,
} from '../utils'
import { EXPENSE_CATEGORIES, findCategory } from '../data'
import type { Tx } from '../types'
import { CategoryIcon, Empty, Money, Seal, SparkSummary, TxRow } from '../components'

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
  const [weekOffset, setWeekOffset] = useState(0)

  const monthTxs = stateMonthTxs(state, today)
  const flow = moneyFlow(state.settings, monthTxs, today)
  const todayTxs = state.txs.filter((t) => t.date === today)
  const todaySum = summarize(todayTxs)

  const base = startOfWeek(today)
  const weekStart = addDays(base, weekOffset * 7)
  const weekEnd = addDays(weekStart, 6)
  const weekDays = eachDay(weekStart, weekEnd)
  const weekTxs = inRange(state.txs, weekStart, weekEnd)
  const weekExpense = sumAmount(weekTxs, 'expense')
  const weekStats = new Map<string, { expense: number; count: number }>()
  for (const tx of weekTxs) {
    const row = weekStats.get(tx.date) ?? { expense: 0, count: 0 }
    if (tx.type === 'expense') row.expense += tx.amount
    row.count += 1
    weekStats.set(tx.date, row)
  }
  const recordedDays = weekDays.filter((d) => (weekStats.get(d)?.count ?? 0) > 0).length

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
  const weekTitle = weekOffset === 0 ? '本周' : `${formatDay(weekStart)} – ${formatDay(weekEnd)}`
  const monthSum = summarize(monthTxs)
  const points = dailySeries(monthTxs, monthRange(today).start, today).map((d) => d.amount)
  const prevStart = monthRange(addMonths(today, -1)).start
  const prevDays = Math.min(parseDate(today).getDate(), daysInMonth(prevStart))
  const prevSpent = sumAmount(inRange(state.txs, prevStart, addDays(prevStart, prevDays - 1)), 'expense')
  const comparePct = prevSpent > 0 ? ((flow.spent - prevSpent) / prevSpent) * 100 : null

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

      <section className="og-card" aria-label="本周概览">
        <div className="og-week-nav">
          <button
            className="og-icon-btn"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="上一周"
            type="button"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <span>{weekTitle}</span>
          <button
            className="og-icon-btn"
            onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
            aria-label="下一周"
            type="button"
            disabled={weekOffset >= 0}
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="og-week">
          {weekDays.map((day) => {
            const row = weekStats.get(day)
            const isToday = day === today
            return (
              <div key={day} className={`og-day${isToday ? ' is-today' : ''}`}>
                <span>{weekdayShort(day)}</span>
                <b>{Number(day.slice(-2))}</b>
                <i className={row && row.count > 0 ? 'has' : ''} />
              </div>
            )
          })}
        </div>

        <p className="og-week-note">
          {recordedDays} 天有记录 · 本周支出 ¥{formatMoneyShort(weekExpense)}
        </p>

        <div className="og-today">
          <span className="og-tile is-green">
            <Plus size={20} strokeWidth={2.2} />
          </span>
          <div className="og-today-copy">
            <span className="og-eyebrow">{weekOffset === 0 ? '今天' : '这一周'}</span>
            <b>
              {weekOffset === 0 ? '已花 ' : '共花 '}
              <Money cents={weekOffset === 0 ? todaySum.expense : weekExpense} decimals="never" />
            </b>
            <small>
              {weekOffset === 0
                ? `按天可花 ¥${formatMoneyShort(Math.max(0, flow.dailyAvailable))}`
                : `${recordedDays} 天有记录`}
            </small>
          </div>
          <button className="og-pill" onClick={onAdd} type="button">
            {weekOffset === 0 ? '记一笔' : '记今天'}
          </button>
        </div>

        <button className="og-ghost-row" onClick={onGoLedger} type="button">
          查看本周流水
          <ChevronRight size={14} strokeWidth={1.8} />
        </button>
      </section>

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

      <SparkSummary
        label={formatMonth(today)}
        spent={flow.spent}
        income={monthSum.income}
        balance={monthSum.income - flow.spent}
        spentPct={flow.spentPct}
        points={points}
        comparePct={comparePct}
      />

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
