import { useMemo, useState } from 'react'
import { CalendarDays, ReceiptText } from 'lucide-react'
import { findCategory, useLedger } from '../data'
import {
  addDays,
  cycleRange,
  dailySeries,
  daysBetween,
  eachDay,
  effectivePayday,
  formatDay,
  formatMonth,
  inRange,
  isPaydayDate,
  moneyFlow,
  nextPayday,
  parseDate,
  salaryMonthLabel,
  shiftCycle,
  startOfWeek,
  sumAmount,
  summarize,
  todayStr,
  weekdayLabel,
} from '../lib'
import type { CalendarCell, CalendarMode, Tx } from '../types'
import { Empty, Money, MonthCalendar, SparkSummary, TxRow } from '../ui'

/**
 * 明细：本期趋势、月历、选中日流水。
 * 点某笔流水只回调 onOpenTx，详情弹层由 App 统一挂载。
 */
export function Ledger({ onOpenTx, onAdd }: { onOpenTx: (tx: Tx) => void; onAdd: () => void }) {
  const { state } = useLedger()
  const [anchor, setAnchor] = useState(todayStr())
  const [selected, setSelected] = useState(todayStr())
  const [mode, setMode] = useState<CalendarMode>('amount')
  const [weekOnly, setWeekOnly] = useState(false)

  const payday = state.settings.payday ?? 15
  const salaryLag = state.settings.salaryLag ?? 0
  const today = todayStr()
  const range = cycleRange(anchor, payday, salaryLag)
  const monthTxs = inRange(state.txs, range.start, range.end)
  const sum = summarize(monthTxs)
  const isCurrent = range.start <= today && today <= range.end

  // 迷你趋势：本期每天的支出（当前账期只画到今天），和上期同期对比
  const flow = moneyFlow(state.settings, monthTxs, isCurrent ? today : range.end, range)
  const points = dailySeries(monthTxs, range.start, isCurrent ? today : range.end).map((d) => d.amount)
  const prevRange = cycleRange(addDays(range.start, -1), payday, salaryLag)
  const prevDays = isCurrent
    ? Math.min(daysBetween(range.start, today) + 1, daysBetween(prevRange.start, prevRange.end) + 1)
    : daysBetween(prevRange.start, prevRange.end) + 1
  const prevSpent = sumAmount(
    inRange(state.txs, prevRange.start, addDays(prevRange.start, prevDays - 1)),
    'expense',
  )
  const comparePct = prevSpent > 0 ? ((sum.expense - prevSpent) / prevSpent) * 100 : null

  // 日历格子：从当月第一天所在周的周一开始，补满整周
  const gridStart = startOfWeek(range.start)
  const lead = daysBetween(gridStart, range.start)
  const totalDays = daysBetween(range.start, range.end) + 1
  const gridEnd = addDays(gridStart, Math.ceil((lead + totalDays) / 7) * 7 - 1)

  const paydayDay = state.settings.payday ?? 15
  const paydayOverrides = state.settings.paydayOverrides
  const actualPayday = effectivePayday(range.start, paydayDay, paydayOverrides)
  const nextPay = nextPayday(today, paydayDay, paydayOverrides)
  const nextPaySpan = Math.max(1, daysBetween(today, nextPay))

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
      const isPayday = date >= range.start && date <= range.end && isPaydayDate(date, paydayDay, paydayOverrides)
      return {
        date,
        day: parseDate(date).getDate(),
        inMonth: date >= range.start && date <= range.end,
        expense: row?.expense ?? 0,
        income: row?.income ?? 0,
        count: row?.count ?? 0,
        isPayday,
        // 发薪日自己用金币角标，不再叠倒计时色
        payLevel:
          !isPayday && date >= today && date <= nextPay
            ? Math.min(4, Math.max(1, Math.ceil(((daysBetween(today, date) + 1) / nextPaySpan) * 4)))
            : 0,
      }
    })
  }, [state.txs, gridStart, gridEnd, range.start, range.end, paydayDay, paydayOverrides, today, nextPay, nextPaySpan])

  const dayTxs = useMemo(
    () => state.txs.filter((t) => t.date === selected).sort((a, b) => b.createdAt - a.createdAt),
    [state.txs, selected],
  )
  const dayExpense = sumAmount(dayTxs, 'expense')
  const dayIncome = sumAmount(dayTxs, 'income')
  const badge = selected === today ? '今天' : selected === addDays(today, -1) ? '昨天' : ''

  function shiftMonth(delta: number) {
    const nextStart = shiftCycle(range.start, delta, payday)
    const nextRange = cycleRange(nextStart, payday, salaryLag)
    const offset = Math.max(0, daysBetween(range.start, selected))
    const nextSelected = addDays(nextRange.start, Math.min(offset, daysBetween(nextRange.start, nextRange.end)))
    setAnchor(nextStart)
    setSelected(nextSelected)
  }

  function pickDate(date: string) {
    setSelected(date)
    const next = cycleRange(date, payday, salaryLag)
    if (next.start !== range.start) setAnchor(date)
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
        label={isCurrent ? '本月支出' : `${parseDate(range.start).getMonth() + 1} 月支出`}
        spent={sum.expense}
        income={sum.income}
        balance={sum.income - sum.expense}
        spentPct={flow.spentPct}
        points={points}
        comparePct={comparePct}
      />

      <MonthCalendar
        month={range.start}
        title={formatMonth(range.start)}
        caption={`${salaryMonthLabel(range.salaryMonth)} · ${actualPayday} 号到账`}
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
                onClick={() => onOpenTx(tx)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
