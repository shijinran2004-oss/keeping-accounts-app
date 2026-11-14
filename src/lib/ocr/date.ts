import type { OcrLine } from '../../types'
import { cleanLine, compact } from './text'

export interface DateCandidate {
  /** YYYY-MM-DD */
  date: string
  confidence: number
  line: string
}

const DATE_NOISE = ['单号', '票号', '流水号', '编号', '电话', '手机']

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const probe = new Date(year, month - 1, day)
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

function daysBetween(a: string, b: string): number {
  const t1 = new Date(a + 'T00:00:00').getTime()
  const t2 = new Date(b + 'T00:00:00').getTime()
  return Math.round((t2 - t1) / 86400000)
}

/** 从一行里抠日期候选；today 只用于补全“11月14日”这种缺年份的写法 */
export function dateCandidates(line: string, today: string): DateCandidate[] {
  const raw = cleanLine(line)
  if (!raw) return []
  const text = compact(raw)
  const noisy = DATE_NOISE.some((k) => text.includes(k))
  const out: DateCandidate[] = []

  const push = (yy: number, mm: number, dd: number, confidence: number) => {
    const value = iso(yy, mm, dd)
    if (!value) return
    out.push({ date: value, confidence: Math.max(0, confidence - (noisy ? 0.3 : 0)), line: raw })
  }

  for (const m of text.matchAll(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), 0.92)
  }
  for (const m of text.matchAll(/(20\d{2})(\d{2})(\d{2})/g)) {
    push(Number(m[1]), Number(m[2]), Number(m[3]), 0.6)
  }
  for (const m of text.matchAll(/(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/g)) {
    const yy = Number(m[1])
    if (yy < 10 || yy > 99) continue
    push(2000 + yy, Number(m[2]), Number(m[3]), 0.62)
  }
  // 只写了月日：用今年的年份，跨年时退回去年
  const year = Number(today.slice(0, 4))
  for (const m of text.matchAll(/(\d{1,2})月(\d{1,2})日/g)) {
    push(year, Number(m[1]), Number(m[2]), 0.7)
    push(year - 1, Number(m[1]), Number(m[2]), 0.55)
  }

  return out
}

/** 挑一个最可信、且不早于 5 年前的日期 */
export function pickDate(lines: OcrLine[], today: string): DateCandidate | null {
  const all: DateCandidate[] = []
  for (const line of lines) all.push(...dateCandidates(line.text, today))
  const yearFloor = String(Number(today.slice(0, 4)) - 5) + today.slice(4)
  const usable = all.filter((c) => c.date >= yearFloor && c.date <= today)
  const pool = usable.length > 0 ? usable : all
  if (pool.length === 0) return null

  const ranked = pool
    .map((c) => {
      let score = c.confidence * 100
      const gap = Math.abs(daysBetween(c.date, today))
      if (gap <= 7) score += 8
      else if (gap <= 60) score += 3
      else if (gap > 365) score -= 5
      return { c, score }
    })
    .sort((a, b) => b.score - a.score)
  return ranked[0].c
}
