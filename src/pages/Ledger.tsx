import { useMemo, useState } from 'react'
import { CalendarDays, ReceiptText } from 'lucide-react'
import { findCategory, useLedger } from '../data'
import {
  addDays,
  addMonths,
  dailySeries,
  daysBetween,
  daysInMonth,
  eachDay,
  formatDay,
  formatMonth,
  inRange,
  moneyFlow,
  monthKey,
  monthRange,
  parseDate,
  startOfWeek,
  sumAmount,
  summarize,
  toDateStr,
  todayStr,
  weekdayLabel,
} from '../utils'
import type { CalendarCell, CalendarMode, Tx } from '../types'
import { Empty, Money, MonthCalendar, SparkSummary, TxRow } from '../components'

export function Ledger({ onEdit, onAdd }: { onEdit: (tx: Tx) => void; onAdd: () => void }) {
  const { state } = useLedger()
  const [anchor, setAnchor] = useState(todayStr())
  const [selected, setSelected] = useState(todayStr())
  const [mode, setMode] = useState<CalendarMode>('amount')
  const [weekOnly, setWeekOnly] = useState(false)

  const range = monthRange(anchor)
  const monthTxs = inRange(state.txs, range.start, range.end)
  const sum = summarize(monthTxs)
  const today = todayStr()
  const isCurrent = monthKey(anchor) === monthKey(today)

  // 迷你趋势：本月每天的支出（当月只画到今天），和上月同期做个对比
  const flow = moneyFlow(state.settings, monthTxs, anchor)
  const points = dailySeries(monthTxs, range.start, isCurrent ? today : range.end).map((d) => d.amount)
  const prevStart = monthRange(addMonths(anchor, -1)).start
  const prevDays = isCurrent ? Math.min(parseDate(today).getDate(), daysInMonth(prevStart)) : daysInMonth(prevStart)
  const prevSpent = sumAmount(inRange(state.txs, prevStart, addDays(prevStart, prevDays - 1)), 'expense')
  const comparePct = prevSpent > 0 ? ((sum.expense - prevSpent) / prevSpent) * 100 : null

  // 日历格子：从 1 号所在周的周一开始，补满整周（5 或 6 行）
  const gridStart = startOfWeek(range.start)
  const lead = daysBetween(gridStart, range.start)
  const gridEnd = addDays(gridStart, Math.ceil((lead + daysInMonth(anchor)) / 7) * 7 - 1)

  const cells = useMemo<CalendarCell[]>(() => {
    const stats = new Map<string, { expense: number; income: number; count: number }>()
    for (const tx of inRange(state.txs, gridStart, gridEnd)) {
      const row = stats.get(tx.date) ?? { expense: 0, income: 0, count: 0 }
      if (tx.type === 'expense') row.expense += tx.amount
      else row.income += tx.amount
      row.count += 1
      stats.set(tx.date, row)
    }
    return eachDay(gridStart, gridEnd).map((date) => {
      const row = stats.get(date)
      return {
        date,
        day: parseDate(date).getDate(),
        inMonth: monthKey(date) === monthKey(anchor),
        expense: row?.expense ?? 0,
        income: row?.income ?? 0,
        count: row?.count ?? 0,
      }
    })
  }, [state.txs, gridStart, gridEnd, anchor])

  const dayTxs = useMemo(
    () => state.txs.filter((t) => t.date === selected).sort((a, b) => b.createdAt - a.createdAt),
    [state.txs, selected],
  )
  const dayExpense = sumAmount(dayTxs, 'expense')
  const dayIncome = sumAmount(dayTxs, 'income')
  const badge = selected === today ? '今天' : selected === addDays(today, -1) ? '昨天' : ''

  function shiftMonth(delta: number) {
    const next = addMonths(anchor, delta)
    const nextDay = Math.min(parseDate(selected).getDate(), daysInMonth(next))
    const d = parseDate(next)
    d.setDate(nextDay)
    setAnchor(next)
    setSelected(toDateStr(d))
  }

  function pickDate(date: string) {
    setSelected(date)
    if (monthKey(date) !== monthKey(anchor)) setAnchor(date)
  }

  function goToday() {
    setAnchor(today)
    setSelected(today)
  }

  return (
    <div className="page ledger">
      <header className="page-head">
        <div>
          <h1>明细</h1>
          <p>{monthTxs.length} 笔记录 · 点日期看当天</p>
        </div>
      </header>

      <SparkSummary
        label={isCurrent ? '本月支出' : `${parseDate(anchor).getMonth() + 1} 月支出`}
        spent={sum.expense}
        income={sum.income}
        balance={sum.income - sum.expense}
        spentPct={flow.spentPct}
        points={points}
        comparePct={comparePct}
      />

      <MonthCalendar
        month={anchor}
        selected={selected}
        cells={cells}
        mode={mode}
        weekOnly={weekOnly}
        onChangeMonth={shiftMonth}
        onSelect={pickDate}
        onToday={goToday}
        onMode={setMode}
        onToggleWeek={() => setWeekOnly((v) => !v)}
      />

      <section className="day-group" key={selected}>
        <div className="day-head">
          <span>
            {formatDay(selected)} · {weekdayLabel(selected)}
            {badge && <em>{badge}</em>}
          </span>
          <span>
            {dayExpense > 0 && (
              <>
                支出 <Money cents={dayExpense} symbol={false} decimals="never" />
              </>
            )}
            {dayExpense > 0 && dayIncome > 0 && ' · '}
            {dayIncome > 0 && (
              <>
                收入 <Money cents={dayIncome} symbol={false} decimals="never" />
              </>
            )}
            {!dayExpense && !dayIncome && '没有收支'}
          </span>
        </div>

        {dayTxs.length === 0 ? (
          <div className="card">
            <Empty
              icon={CalendarDays}
              title="这一天还没有记账"
              hint="点日历上的其他日期翻翻，或者现在补一笔。"
              action={
                <button type="button" className="btn-ghost sm" onClick={onAdd}>
                  去记一笔
                </button>
              }
            />
          </div>
        ) : (
          <div className="card list-card">
            {dayTxs.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                category={findCategory(state.categories, tx.categoryId)}
                onClick={() => onEdit(tx)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
