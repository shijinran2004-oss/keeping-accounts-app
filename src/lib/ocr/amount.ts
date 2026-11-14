import type { OcrLine } from '../../types'
import { cleanLine, compact, maskNoise } from './text'

/** 金额候选 */
export interface AmountCandidate {
  cents: number
  /** 0–1 */
  confidence: number
  line: string
  keyword: string
}

/** 关键词权重：实付 > 合计 > 泛指的“金额” */
const KEYWORD_WEIGHTS: Array<[string, number]> = [
  ['实付', 8], ['实收', 8], ['应付', 8], ['本次实付', 8], ['实付金额', 8],
  ['付款金额', 7], ['支付金额', 7], ['实际支付', 7],
  ['合计', 6], ['总计', 6], ['总金额', 6], ['应收', 6], ['应收金额', 6],
  ['本次消费', 5], ['消费金额', 5], ['共消费', 5],
  ['金额', 3], ['小计', 2], ['价格', 1], ['单价', 1],
]

const NEGATIVE = ['找零', '找赎', '余额', '优惠', '折扣', '减免', '税额', '税率', '积分', '储值', '充值', '原价', '抹零', '红包', '代金券', '会员价', '押金']

const MONEY_RE = /(¥\s*)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g

function keywordOf(text: string): { keyword: string; weight: number } {
  let best = { keyword: '', weight: 0 }
  for (const [keyword, weight] of KEYWORD_WEIGHTS) {
    if (weight > best.weight && text.includes(keyword)) best = { keyword, weight }
  }
  return best
}

function penaltyOf(text: string): number {
  let penalty = 0
  for (const k of NEGATIVE) if (text.includes(k)) {
    penalty -= 9
    break
  }
  return penalty
}

/** 从一行里抠所有金额候选（分） */
export function amountCandidates(line: string): AmountCandidate[] {
  const raw = cleanLine(line)
  if (!raw) return []
  const text = maskNoise(raw)
  const keys = keywordOf(compact(raw))
  const penalty = penaltyOf(compact(raw))
  const out: AmountCandidate[] = []
  MONEY_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MONEY_RE.exec(text)) !== null) {
    const hasYen = Boolean(m[1])
    const integer = m[2].replace(/,/g, '')
    const fraction = m[3] ?? ''
    const value = Number(integer + (fraction ? '.' + fraction : ''))
    if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) continue
    const cents = Math.round(value * 100)
    // 只有带 ¥、带小数、或者这一行有关键词，才算“像钱”
    if (!hasYen && !fraction && keys.weight === 0) continue
    let score = keys.weight + penalty
    if (hasYen) score += 3
    if (fraction) score += 1
    if (keys.weight === 0 && hasYen) score += 1
    const confidence = Math.max(0, Math.min(1, 0.3 + score * 0.05))
    out.push({ cents, confidence, line: raw, keyword: keys.keyword })
  }
  return out
}

/**
 * 小票常见“标签一行、金额一行”的排版，所以除了单行，还要把相邻两行拼起来看一遍。
 * 否则「实付金额」和「¥28.20」分属两块时，会退化成“取最大金额”。
 */
function scanTexts(lines: OcrLine[]): string[] {
  const out: string[] = []
  lines.forEach((line, index) => {
    out.push(line.text)
    if (index + 1 < lines.length) out.push(`${line.text} ${lines[index + 1].text}`)
  })
  return out
}

/** 猜这张小票的金额：实付/合计优先，找零/优惠之类直接压下去 */
export function pickAmount(lines: OcrLine[]): AmountCandidate | null {
  if (lines.length === 0) return null
  const all: AmountCandidate[] = []
  for (const text of scanTexts(lines)) all.push(...amountCandidates(text))
  if (all.length === 0) return null

  const best = all
    .map((c) => ({ c, s: c.confidence * 100 + Math.min(c.cents, 1_000_000) / 1_000_000 }))
    .sort((a, b) => b.s - a.s)[0].c
  if (best.confidence >= 0.5) return best

  // 没有任何关键词命中：取带小数的最大金额
  const withFraction = all.filter((c) => /\d+\.\d{1,2}/.test(c.line))
  const pool = withFraction.length > 0 ? withFraction : all
  const largest = pool.reduce((a, b) => (b.cents > a.cents ? b : a))
  return { ...largest, confidence: Math.min(largest.confidence, 0.4) }
}
