import type { AutoRecord, Category, Tx } from '../types'
import { parseReceipt, todayStr } from '../lib'
import { uid } from './normalize'

/** 去掉小票上「商户：」这类前缀，入账的备注只留店名 */
function cleanMerchant(name: string | null): string {
  return (name ?? '').replace(/^商\s*户\s*[:：]\s*/, '')
}

/**
 * 把通知里「直接记一笔」暂存的一条记录变成真正的账目。
 *
 * 原生只用金额判断「值不值得提醒」，它不解析商户和分类，所以这里补上；
 * 遇到「合计 2820」这种吞小数点的行，原生会算成 100 倍，
 * 只要和解析结果对得上，就按解析出来的分算，和小票识别的口径一致。
 */
export function autoRecordToTx(
  record: AutoRecord,
  categories: Category[],
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
  // 静默记账的通知可能是退款/到账，那种按收入记；截图识别出来的都是支出
  const income = record.type === 'income'
  const type = income ? 'income' : 'expense'
  const categoryId =
    draft.categoryId &&
    categories.some(
      (category) => category.id === draft.categoryId && (!category.type || category.type === type),
    )
      ? draft.categoryId
      : income
        ? 'other-income'
        : 'other'
  return {
    // 有 seq 就用它做确定性 id：同一笔重复落库只会覆盖自己，不会多记一笔
    id: record.seq ? `auto-${record.seq}` : uid(),
    type,
    amount,
    categoryId,
    date: draft.date ?? today,
    // 通知里已经认出商户就用它；截图那条只有 OCR 文字，还是走 parseReceipt
    note: cleanMerchant(record.merchant || draft.merchant || record.platform || ''),
    createdAt: record.createdAt || Date.now(),
  }
}
