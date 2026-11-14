import type { OcrLine } from '../../types'
import { cleanLine, compact, digitRatio, letterCount } from './text'

export interface MerchantCandidate {
  name: string
  confidence: number
  line: string
}

const NOISE_WORDS = [
  '小票', '收据', '发票', '单号', '日期', '时间', '收银', '机号', '工号',
  '电话', '地址', '会员', '欢迎', '谢谢', '微信', '支付宝', '支付', '合计',
  '金额', '商品', '数量', '单价', '找零', '优惠', '营业', '服务台', '客服',
]

/** 从票据上半部分猜商户名：去掉编号、地址、电话、支付方式这些行 */
export function pickMerchant(lines: OcrLine[]): MerchantCandidate | null {
  const head = lines.slice(0, 12)
  let best: MerchantCandidate | null = null

  head.forEach((line, index) => {
    const raw = cleanLine(line.text)
    const text = compact(raw)
    if (text.length < 2 || text.length > 24) return
    if (letterCount(text) < 2) return
    if (digitRatio(text) > 0.3) return
    if (NOISE_WORDS.some((w) => text.includes(w))) return
    // 纯符号行（中文属于 \W，这里必须按 Unicode 字母/数字判断）
    if (!/[\p{L}\p{N}]/u.test(text)) return

    const positionScore = index <= 2 ? 0.9 : index <= 5 ? 0.7 : 0.5
    const lengthScore = text.length >= 3 && text.length <= 14 ? 0.05 : 0
    const candidate: MerchantCandidate = {
      name: text,
      confidence: Math.min(0.95, positionScore + lengthScore),
      line: raw,
    }
    if (!best || candidate.confidence > best.confidence) best = candidate
  })

  return best
}
