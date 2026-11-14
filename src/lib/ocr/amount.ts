import type { OcrLine } from '../../types'
import { cleanLine, compact, maskNoise } from './text'

/** 金额候选 */
export interface AmountCandidate {
  cents: number
  /** 0–1 */
  confidence: number
  line: string
  keyword: string
  /** 紧挨金额前面的标签权重；0 表示前面没有「实付/合计」这类词 */
  labelWeight: number
  /** 前面带负号（-¥6.00 这种优惠/退款） */
  negative: boolean
  /** 带小数点 */
  hasFraction: boolean
  /** 疑似 OCR 把小数点吞了：有关键词的整数金额 */
  dotSuspect: boolean
  /** 需要用户核对时的提示 */
  warning: string | null
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

/** 标签最远只回看 8 个字，避免把上一句商品名也算进来 */
const LABEL_MAX = 8

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

/**
 * 取紧挨在金额前面的标签。
 * 只往左收集连续的中文/字母，遇到数字、空格、货币符号、负号就停。
 * 这样「原价 58.00 折扣 -10.00 实付 48.00」里的每个数字各认各的标签，
 * 而不是整行共用一个权重。
 */
function labelBefore(text: string, start: number, floor: number): string {
  let i = start - 1
  while (i >= floor && !/[\u4e00-\u9fa5A-Za-z]/.test(text[i])) i--
  const end = i
  while (i >= floor && /[\u4e00-\u9fa5A-Za-z]/.test(text[i])) i--
  const run = text.slice(i + 1, end + 1)
  return run.length > LABEL_MAX ? run.slice(-LABEL_MAX) : run
}

/** 金额前面是不是带负号（-¥6.00 / -6.00） */
function hasMinus(text: string, start: number, floor: number): boolean {
  let i = start - 1
  while (i >= floor && /[\s¥]/.test(text[i])) i--
  return i >= floor && /[-–—]/.test(text[i])
}

/** 分 -> 元，两位小数 */
function yuan(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** 从一行里抠所有金额候选（分） */
export function amountCandidates(line: string): AmountCandidate[] {
  const raw = cleanLine(line)
  if (!raw) return []
  const text = maskNoise(raw)
  const out: AmountCandidate[] = []
  MONEY_RE.lastIndex = 0
  let prevEnd = 0
  let m: RegExpExecArray | null
  while ((m = MONEY_RE.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    const hasYen = Boolean(m[1])
    const integer = m[2].replace(/,/g, '')
    const fraction = m[3] ?? ''
    const value = Number(integer + (fraction ? '.' + fraction : ''))
    if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
      prevEnd = end
      continue
    }
    const cents = Math.round(value * 100)
    const label = labelBefore(text, start, prevEnd)
    const keys = keywordOf(label)
    const penalty = penaltyOf(label)
    const negative = hasMinus(text, start, prevEnd)

    // 只有带 ¥、带小数、或者紧挨关键词、或者带负号，才算“像钱”
    if (!hasYen && !fraction && keys.weight === 0 && !negative) {
      prevEnd = end
      continue
    }

    let score = keys.weight + penalty
    if (negative) score -= 9
    if (hasYen) score += 3
    if (fraction) score += 1
    if (keys.weight === 0 && hasYen) score += 1
    let confidence = Math.max(0, Math.min(1, 0.3 + score * 0.05))

    // 热敏纸常见「合计 2820」这种小数点被吞掉的样子：先标记，分数降下来等复核
    const dotSuspect = !fraction && !hasYen && !negative && keys.weight > 0 && value >= 100
    let warning: string | null = null
    if (dotSuspect) {
      confidence = Math.min(confidence, 0.45)
      warning = `「${label}」后面的 ${integer} 没有小数点，可能是 ${yuan(cents)} 元，请核对`
    }

    out.push({ cents, confidence, line: raw, keyword: keys.keyword, labelWeight: keys.weight, negative, hasFraction: Boolean(fraction), dotSuspect, warning })
    prevEnd = end
  }
  return out
}

/**
 * 吞掉小数点的整数金额，用其他商品的金额合计来反推：
 * 2820 既可能是 28.20，也可能是 2820.00，看哪个和商品加起来对得上。
 */
function resolveDot(c: AmountCandidate, itemSum: number): AmountCandidate {
  if (!c.dotSuspect) return c
  const raw = Math.round(c.cents / 100)
  const asCents = raw
  const asYuan = raw * 100
  const near = (target: number) => itemSum > 0 && Math.abs(itemSum - target) <= Math.max(2, Math.round(target * 0.02))
  if (near(asCents)) {
    c.cents = asCents
    c.confidence = 0.6
    c.warning = `这一行没小数点，和商品金额加起来对得上，按 ¥${yuan(asCents)} 记`
  } else if (near(asYuan)) {
    c.cents = asYuan
    c.confidence = 0.5
    c.warning = null
  } else {
    c.cents = asCents
    c.confidence = 0.4
    c.warning = `这一行没小数点，先按 ¥${yuan(asCents)} 记；如果实际是 ¥${yuan(asYuan)}，请改一下`
  }
  return c
}

/** 猜这张小票的金额：实付/合计优先，找零/优惠之类直接压下去 */
export function pickAmount(lines: OcrLine[]): AmountCandidate | null {
  if (lines.length === 0) return null

  const singles: AmountCandidate[] = []
  let itemSum = 0
  for (const line of lines) {
    const cands = amountCandidates(line.text)
    singles.push(...cands)
    // 商品行：一行只有一个金额、没有关键词、带小数，用来反推被吞掉的小数点
    if (cands.length === 1 && cands[0].hasFraction && cands[0].labelWeight === 0 && !cands[0].negative) {
      itemSum += cands[0].cents
    }
  }

  // 小票常见“标签一行、金额一行”的排版，所以相邻两行也要拼起来看一遍
  const pairs: AmountCandidate[] = []
  for (let i = 0; i + 1 < lines.length; i++) {
    pairs.push(...amountCandidates(`${cleanLine(lines[i].text)} ${cleanLine(lines[i + 1].text)}`))
  }

  const all = [...singles, ...pairs].map((c) => resolveDot(c, itemSum))
  if (all.length === 0) return null

  const ranked = all
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.confidence - a.c.confidence || b.c.labelWeight - a.c.labelWeight || b.i - a.i)
  const best = ranked[0].c
  if (best.confidence >= 0.5 || best.dotSuspect) return best

  // 没有任何关键词命中：取带小数的最大金额，别把“找零/优惠/原价”翻出来
  const usable = all.filter((c) => !c.negative && !c.dotSuspect)
  const pool = usable.length > 0 ? usable : all
  const withFraction = pool.filter((c) => c.hasFraction)
  const candidates = withFraction.length > 0 ? withFraction : pool
  const largest = candidates.reduce((a, b) => (b.cents > a.cents ? b : a))
  return {
    ...largest,
    confidence: Math.min(largest.confidence, 0.4),
    warning: largest.warning ?? '没认出「合计/实付」这类关键词，取了最大的一笔，请核对',
  }
}
