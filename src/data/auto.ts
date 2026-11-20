import type { AutoRecord, Category, Tx } from '../types'
import { parseReceipt, todayStr } from '../lib'
import { guessCategory, merchantOfNote } from './hints'
import { uid } from './normalize'

/** 去掉小票上「商户：」这类前缀，入账的备注只留店名 */
function cleanMerchant(name: string | null | undefined): string {
  return (name ?? '').replace(/^商\s*户\s*[:：]\s*/, '').trim()
}

/**
 * 把原生暂存的一条识别记录变成真正的账目。
 *
 * 原生只用金额判断「值不值得提醒」，商户和分类现在由原生按识别提示先猜一次
 * （CategoryHints：关键词表 + 商户记忆），前端再用同一套评分补一次：
 * 原生猜到的分类优先（它可能已经用过更新的记忆），没有就按关键词猜，
 * 最后才退回小票解析的结果和「其他」。
 */
export function autoRecordToTx(
  record: AutoRecord,
  categories: Category[],
  memory: Record<string, string> = {},
  today: string = todayStr(),
): Tx | null {
  const lines = record.text
    .split('\n')
    .filter((text) => text.trim().length > 0)
    .map((text) => ({ text, score: 1, box: [] }))
  const draft = parseReceipt(lines, { today })
  const parsed = draft.amountCents ?? 0
  let amount = record.amountCents
  if (parsed > 0 && (amount <= 0 || amount === parsed * 100)) amount = parsed
  if (!amount) return null

  const known = (id: string | undefined | null) =>
    !!id && categories.some((category) => category.id === id)
  const merchant = cleanMerchant(record.merchant ?? draft.merchant)
  // 备注可能是「星巴克 · 拿铁」，商户记忆按第一个「·」前面的店名查
  const remembered = memory[merchantOfNote(merchant)] ?? memory[merchant] ?? ''
  const hinted = guessCategory(categories, record.text, merchant, memory)
  const categoryId = known(remembered)
    ? remembered
    : known(record.categoryId)
      ? (record.categoryId as string)
      : hinted ?? (known(draft.categoryId) ? (draft.categoryId as string) : 'other')

  return {
    // 有 seq 就用它做确定性 id：同一笔重复落库只会覆盖自己，不会多记一笔
    id: record.seq ? `auto-${record.seq}` : uid(),
    type: 'expense',
    amount,
    categoryId,
    date: draft.date ?? today,
    note: merchant,
    createdAt: record.createdAt || Date.now(),
    orderId: record.orderId,
  }
}
