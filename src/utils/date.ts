import type { CycleRange } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return toDateStr(d)
}

export function monthKey(s: string): string {
  return s.slice(0, 7)
}

export function daysInMonth(s: string): number {
  const d = parseDate(s)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Monday-based start of week */
export function startOfWeek(s: string): string {
  const d = parseDate(s)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return toDateStr(d)
}

export function endOfWeek(s: string): string {
  return addDays(startOfWeek(s), 6)
}

export function daysBetween(a: string, b: string): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime()
  return Math.round(ms / 86400000)
}

export function weekdayShort(s: string): string {
  return ['日', '一', '二', '三', '四', '五', '六'][parseDate(s).getDay()]
}

export function weekdayLabel(s: string): string {
  return `周${weekdayShort(s)}`
}

export function formatMonth(s: string): string {
  const d = parseDate(s)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
}

export function formatDay(s: string): string {
  const d = parseDate(s)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function formatDayLong(s: string): string {
  const d = parseDate(s)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${weekdayLabel(s)}`
}

export function isSameMonth(a: string, b: string): boolean {
  return monthKey(a) === monthKey(b)
}

export function monthRange(s: string): { start: string; end: string } {
  const d = parseDate(s)
  d.setDate(1)
  const start = toDateStr(d)
  const end = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  return { start, end }
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < 400) {
    out.push(cur)
    cur = addDays(cur, 1)
    guard++
  }
  return out
}

/** 某月的发薪日；29/30/31 在短月自动夹到最后一天 */
function paydayDate(year: number, month: number, payday: number): Date {
  const max = new Date(year, month + 1, 0).getDate()
  const day = Math.min(Math.max(1, Math.round(payday || 1)), max)
  return new Date(year, month, day)
}

/** 预算月：自然月 1 号到月末；工资归属由 salaryLag 决定，发薪日只影响哪天到账 */
export function cycleRange(s: string, _payday = 1, salaryLag = 0): CycleRange {
  const d = parseDate(s)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const salaryMonth = new Date(d.getFullYear(), d.getMonth() - (salaryLag ? 1 : 0), 1)
  return {
    start: toDateStr(start),
    end: toDateStr(end),
    salaryMonth: toDateStr(salaryMonth),
  }
}

/** 某个月的实际发薪日：优先读这个月的覆盖值，否则用默认值 */
export function effectivePayday(s: string, payday = 15, overrides?: Record<string, number>): number {
  return overrides?.[s.slice(0, 7)] ?? payday
}

/** 下一个发薪日（今天就是发薪日时返回今天）；个别月份可覆盖 */
export function nextPayday(s: string, payday = 15, overrides?: Record<string, number>): string {
  const d = parseDate(s)
  const thisDay = effectivePayday(s, payday, overrides)
  const thisPay = paydayDate(d.getFullYear(), d.getMonth(), thisDay)
  if (toDateStr(d) <= toDateStr(thisPay)) return toDateStr(thisPay)
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const nextKey = toDateStr(nextMonth)
  const nextDay = effectivePayday(nextKey, payday, overrides)
  return toDateStr(paydayDate(nextMonth.getFullYear(), nextMonth.getMonth(), nextDay))
}

/** 把预算月往前/后挪 n 个月 */
export function shiftCycle(s: string, n: number, _payday = 1): string {
  const d = parseDate(s)
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

/** 例如「10 月工资」 */
export function salaryMonthLabel(salaryMonth: string): string {
  return `${parseDate(salaryMonth).getMonth() + 1} 月工资`
}

/** 账期范围小字，例如「11 月 15 日 – 12 月 14 日」 */
export function cycleRangeLabel(start: string, end: string): string {
  return `${formatDay(start)} – ${formatDay(end)}`
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours()
  if (h < 5) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
}

export function relativeDay(s: string): string {
  const t = todayStr()
  if (s === t) return '今天'
  if (s === addDays(t, -1)) return '昨天'
  if (s === addDays(t, -2)) return '前天'
  return formatDay(s)
}
