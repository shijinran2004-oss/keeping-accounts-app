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

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function relativeDay(s: string): string {
  const t = todayStr()
  if (s === t) return '今天'
  if (s === addDays(t, -1)) return '昨天'
  if (s === addDays(t, -2)) return '前天'
  return formatDay(s)
}
