import type { Category, CategorySlice, LedgerState, MoneyFlow, Settings, Tx } from '../types'
import { cycleRange, daysBetween, monthRange, parseDate, todayStr } from './date'

export function inRange(txs: Tx[], start: string, end: string): Tx[] {
  return txs.filter((t) => t.date >= start && t.date <= end)
}

export function sumAmount(txs: Tx[], type?: Tx['type']): number {
  return txs.reduce((acc, t) => (type && t.type !== type ? acc : acc + t.amount), 0)
}

export function summarize(txs: Tx[]) {
  let expense = 0
  let income = 0
  for (const t of txs) {
    if (t.type === 'expense') expense += t.amount
    else income += t.amount
  }
  return { expense, income, count: txs.length }
}

export function categoryBreakdown(txs: Tx[], categories: Category[], type: 'expense' | 'income'): CategorySlice[] {
  const list = txs.filter((t) => t.type === type)
  const total = sumAmount(list)
  const map = new Map<string, { amount: number; count: number }>()
  for (const t of list) {
    const cur = map.get(t.categoryId) ?? { amount: 0, count: 0 }
    cur.amount += t.amount
    cur.count += 1
    map.set(t.categoryId, cur)
  }
  const out: CategorySlice[] = []
  for (const [id, v] of map) {
    const category =
      categories.find((c) => c.id === id) ??
      ({ id, name: '其他', icon: 'shapes', color: '#8C867A', type } as Category)
    out.push({ category, amount: v.amount, count: v.count, pct: total ? (v.amount / total) * 100 : 0 })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

export function groupByDay(txs: Tx[]): Map<string, Tx[]> {
  const map = new Map<string, Tx[]>()
  for (const t of txs) {
    const arr = map.get(t.date) ?? []
    arr.push(t)
    map.set(t.date, arr)
  }
  return map
}

export function moneyFlow(
  settings: Settings,
  monthTxs: Tx[],
  date: string,
  cycle?: { start: string; end: string },
): MoneyFlow {
  const salary = settings.salary
  const fixedCost = settings.fixedCost
  const extraIncome = sumAmount(monthTxs, 'income')
  const income = salary + extraIncome
  const available = Math.max(0, income - fixedCost)
  const spent = sumAmount(monthTxs, 'expense')
  const remaining = available - spent
  const start = cycle?.start ?? monthRange(date).start
  const end = cycle?.end ?? monthRange(date).end
  const totalDays = Math.max(1, daysBetween(start, end) + 1)
  const offset = Math.max(0, Math.min(totalDays - 1, daysBetween(start, date)))
  const daysElapsed = offset + 1
  const daysLeft = Math.max(1, totalDays - offset)
  const totalOutflow = fixedCost + spent
  return {
    salary,
    extraIncome,
    income,
    fixedCost,
    available,
    spent,
    remaining,
    spentPct: available > 0 ? (spent / available) * 100 : 0,
    fixedPct: salary > 0 ? (fixedCost / salary) * 100 : 0,
    remainingPct: available > 0 ? (remaining / available) * 100 : 0,
    totalOutflow,
    outflowPct: salary > 0 ? (totalOutflow / salary) * 100 : 0,
    saveRate: income > 0 ? ((income - fixedCost - spent) / income) * 100 : 0,
    daysLeft,
    dailyAvailable: daysLeft > 0 ? remaining / daysLeft : 0,
    daysElapsed,
    dailyAverage: daysElapsed > 0 ? spent / daysElapsed : 0,
  }
}

export function stateMonthTxs(state: LedgerState, date: string): Tx[] {
  const { start, end } = monthRange(date)
  return inRange(state.txs, start, end)
}

/** 当前日期所在账期的流水（按发薪日切账期） */
export function stateCycleTxs(state: LedgerState, date: string): Tx[] {
  const payday = state.settings.payday ?? 1
  const lag = state.settings.salaryLag ?? 0
  const { start, end } = cycleRange(date, payday, lag)
  return inRange(state.txs, start, end)
}

export function dailySeries(txs: Tx[], start: string, end: string): { date: string; amount: number }[] {
  const n = daysBetween(start, end) + 1
  const map = new Map<string, number>()
  for (const t of inRange(txs, start, end)) {
    if (t.type !== 'expense') continue
    map.set(t.date, (map.get(t.date) ?? 0) + t.amount)
  }
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(parseDate(start))
    d.setDate(d.getDate() + i)
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: ds, amount: map.get(ds) ?? 0 }
  })
}

/** 从 date 往前数，连续有记账的天数（当天没记就是 0） */
export function streakDays(txs: Tx[], date: string): number {
  if (!txs.length) return 0
  const days = new Set(txs.map((t) => t.date))
  let n = 0
  const d = parseDate(date)
  while (n < 400) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!days.has(key)) break
    n += 1
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function previousRange(kind: 'day' | 'week' | 'month', date: string): { start: string; end: string } {
  const d = parseDate(date)
  if (kind === 'day') {
    d.setDate(d.getDate() - 1)


    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { start: ds, end: ds }
  }
  if (kind === 'week') {
    d.setDate(d.getDate() - 7)
    const start = new Date(d)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const f = (x: Date) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    return { start: f(start), end: f(end) }
  }
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const start = prev
  const end = new Date(prev.getFullYear(), prev.getMonth() + 1, 0)
  const f = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { start: f(start), end: f(end) }
}

export function todayRange(): { start: string; end: string } {
  const t = todayStr()
  return { start: t, end: t }
}
