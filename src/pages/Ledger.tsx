import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react'
import { useLedger } from '../data'
import { addDays, addMonths, daysInMonth, formatDay, formatMonth, monthKey, monthRange, parseDate, relativeDay, todayStr, weekdayLabel } from '../utils'
import { dailySeries, groupByDay, inRange, moneyFlow, sumAmount, summarize } from '../utils'
import { findCategory } from '../data'
import type { TransactionFilter, Tx, TxType } from '../types'
import { Empty, Money, SparkSummary, TxRow } from '../components'

export function Ledger({ onEdit, onAdd }: { onEdit: (tx: Tx) => void; onAdd: () => void }) {
  const { state } = useLedger()
  const [anchor, setAnchor] = useState(todayStr())
  const [filter, setFilter] = useState<TransactionFilter>('all')

  const range = monthRange(anchor)
  const monthTxs = inRange(state.txs, range.start, range.end)
  const sum = summarize(monthTxs)
  const shown = useMemo(
    () =>
      monthTxs
        .filter((t) => filter === 'all' || t.type === filter)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [monthTxs, filter],
  )
  const groups = useMemo(() => Array.from(groupByDay(shown).entries()), [shown])
  const isCurrent = monthKey(anchor) >= monthKey(todayStr())

  // 迷你趋势：本月每天的支出（当月只画到今天），和上月同期做个对比
  const flow = moneyFlow(state.settings, monthTxs, anchor)
  const points = dailySeries(monthTxs, range.start, isCurrent ? todayStr() : range.end).map((d) => d.amount)
  const prevStart = monthRange(addMonths(anchor, -1)).start
  const prevDays = isCurrent
    ? Math.min(parseDate(todayStr()).getDate(), daysInMonth(prevStart))
    : daysInMonth(prevStart)
  const prevSpent = sumAmount(inRange(state.txs, prevStart, addDays(prevStart, prevDays - 1)), 'expense')
  const comparePct = prevSpent > 0 ? ((sum.expense - prevSpent) / prevSpent) * 100 : null

  return (
    <div className="page ledger">
      <header className="page-head">
        <div>
          <h1>明细</h1>
          <p>{monthTxs.length} 笔记录</p>
        </div>
        <div className="month-nav" aria-label="切换月份">
          <button type="button" onClick={() => setAnchor(addMonths(anchor, -1))} aria-label="上个月">
            <ChevronLeft size={18} strokeWidth={1.8} />
          </button>
          <span>{formatMonth(anchor)}</span>
          <button
            type="button"
            onClick={() => setAnchor(addMonths(anchor, 1))}
            disabled={isCurrent}
            aria-label="下个月"
          >
            <ChevronRight size={18} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <SparkSummary
        label="本月支出"
        spent={sum.expense}
        income={sum.income}
        balance={sum.income - sum.expense}
        spentPct={flow.spentPct}
        points={points}
        comparePct={comparePct}
      />

      <div className="filter-row" role="tablist" aria-label="筛选">
        {(['all', 'expense', 'income'] as TransactionFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? 'is-active' : ''}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? '全部' : f === 'expense' ? '支出' : '收入'}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <Empty
            icon={ReceiptText}
            title={filter === 'all' ? '这个月还没有记录' : filter === 'expense' ? '这个月还没有支出' : '这个月还没有收入'}
            hint="记下的每一笔，都会在这里排好队。"
            action={
              <button type="button" className="btn-ghost sm" onClick={onAdd}>
                去记一笔
              </button>
            }
          />
        </div>
      ) : (
        groups.map(([date, list]) => {
          const dayExpense = sumAmount(list, 'expense')
          const dayIncome = sumAmount(list, 'income')
          return (
            <section className="day-group" key={date}>
              <div className="day-head">
                <span>
                  {formatDay(date)} · {weekdayLabel(date)}
                  {relativeDay(date) === '今天' && <em>今天</em>}
                </span>
                <span>
                  {dayExpense > 0 && <>支出 <Money cents={dayExpense} symbol={false} decimals="never" /></>}
                  {dayExpense > 0 && dayIncome > 0 && ' · '}
                  {dayIncome > 0 && <>收入 <Money cents={dayIncome} symbol={false} decimals="never" /></>}
                </span>
              </div>
              <div className="card list-card">
                {list.map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    category={findCategory(state.categories, tx.categoryId)}
                    onClick={() => onEdit(tx)}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
