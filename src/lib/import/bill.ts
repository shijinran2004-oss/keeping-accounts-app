/**
 * 支付宝 / 微信账单 CSV 的识别与导入计划。
 *
 * 数据流：decodeBillBytes(文件) → parseBillCsv(文本) → planBillImport(解析结果, 账本已有流水)
 * → store.importTxs(草稿) 批量写入。
 *
 * 导入不去改账本里已有的记录，只做「新增」；同一天同方向同金额同备注的重复行
 * 会按出现次数抵消，所以同一份 CSV 导入两次不会记两遍。
 */
import type { BillPlan, BillRow, BillSource, ParsedBill, Tx, TxDraft, TxType } from '../../types'
import { guessCategoryId } from './categories'
import { billSignature, findHeaderRow, parseBillCents, parseBillDate, parseCsv } from './csv'

/** 表头单元格归一化：去空白、全角括号转半角 */
function cleanCell(cell: string): string {
  return cell.replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')')
}

function columnIndex(cells: string[], names: string[]): number {
  for (const name of names) {
    const index = cells.findIndex((cell) => cell === name || cell.startsWith(name))
    if (index >= 0) return index
  }
  return -1
}

/** 从表头判断这是哪家的账单 */
function detectSource(cells: string[]): BillSource {
  const has = (name: string) => cells.some((cell) => cell.startsWith(name))
  if (has('交易分类') || has('商品说明') || has('收/付款方式')) return 'alipay'
  if (has('交易类型') || has('当前状态') || has('交易单号')) return 'wechat'
  // 两家都有「收/支」和「金额」时，靠「商户单号 / 商家订单号」再区分一次
  return has('商家订单号') ? 'alipay' : 'wechat'
}

/**
 * 解析账单 CSV 文本。
 *
 * 失败时抛出带中文说明的错误，UI 直接把 message 显示给用户。
 */
export function parseBillCsv(text: string): ParsedBill {
  const rows = parseCsv(text)
  const headerIndex = findHeaderRow(rows, ['交易时间', '金额'])
  if (headerIndex < 0) throw new Error('没找到账单表头，请确认导出的是支付宝或微信的账单 CSV')

  const cells = rows[headerIndex].map(cleanCell)
  const source = detectSource(cells)
  const idx = {
    date: columnIndex(cells, ['交易时间']),
    kind: columnIndex(cells, ['交易分类', '交易类型']),
    merchant: columnIndex(cells, ['交易对方', '交易商户']),
    item: columnIndex(cells, ['商品说明', '商品名称', '商品']),
    direction: columnIndex(cells, ['收/支']),
    amount: columnIndex(cells, ['金额(元)', '金额']),
    status: columnIndex(cells, ['交易状态', '当前状态']),
    // 支付宝叫「交易订单号 / 商家订单号」，微信叫「交易单号 / 商户单号」
    order: columnIndex(cells, [
      '交易订单号',
      '交易单号',
      '商户单号',
      '商家订单号',
      '订单号',
      '交易流水号',
    ]),
  }
  if (idx.date < 0 || idx.amount < 0 || idx.direction < 0) {
    throw new Error('账单缺少必要列：交易时间 / 金额 / 收、支')
  }

  let total = 0
  let skipped = 0
  const billRows: BillRow[] = []

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row || row.length < 2) continue
    // 账单末尾的分隔行
    if (row.length === 1 && row[0].trim().startsWith('---')) continue
    total += 1

    const direction = (row[idx.direction] ?? '').trim()
    // 支付宝的「不计收支」也含「支出」两个字，要先排除掉
    const type: TxType | null = direction.includes('不计')
      ? null
      : direction.includes('支出')
        ? 'expense'
        : direction.includes('收入')
          ? 'income'
          : null
    if (!type) {
      skipped += 1
      continue
    }

    // 交易关闭 / 失败 / 已退款的行不记，避免把没花的钱或退款当成一笔新支出
    const status = idx.status >= 0 ? (row[idx.status] ?? '').trim() : ''
    if (/关闭|失败|退款|全额退/.test(status)) {
      skipped += 1
      continue
    }

    const date = parseBillDate(row[idx.date] ?? '')
    const cents = parseBillCents(row[idx.amount] ?? '')
    if (!date || !cents) {
      skipped += 1
      continue
    }

    const kind = idx.kind >= 0 ? (row[idx.kind] ?? '').trim() : ''
    const merchant = idx.merchant >= 0 ? (row[idx.merchant] ?? '').trim() : ''
    const item = idx.item >= 0 ? (row[idx.item] ?? '').trim() : ''
    const note = [merchant, item].filter((part) => part !== '').join(' · ').slice(0, 60) || kind
    const categoryId =
      guessCategoryId(type, kind, merchant, item) ?? (type === 'income' ? 'other-income' : 'other')
    // 交易单号是账单里最稳的身份：同一笔重复导出两次，单号一定相同
    const order = idx.order >= 0 ? (row[idx.order] ?? '').trim() : ''

    billRows.push({
      date,
      type,
      amount: Math.abs(cents),
      merchant,
      note,
      categoryId,
      orderId: order || undefined,
    })
  }

  if (!billRows.length) {
    throw new Error(total ? '这份账单里没有可导入的收支记录' : '这份账单是空的')
  }

  const dates = billRows.map((row) => row.date).sort()
  return {
    source,
    rows: billRows,
    total,
    skipped,
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
  }
}

/**
 * 把解析结果折算成导入计划：和账本已有流水比对，能重复导入。
 *
 * 先去重靠交易单号：同一笔账单重复导出两次，单号一定相同，最准。
 * 账单没带单号（或账本里的记录没存单号）时退回签名 = 日期 + 方向 + 金额 + 备注（去空白）：
 * 账本里已有几条同签名记录，就允许这次导入几条，超出的才算新增——
 * 这样「同一天买两次同价同店」不会被误吞。
 */
export function planBillImport(bill: ParsedBill, existing: Tx[]): BillPlan {
  const remaining = new Map<string, number>()
  const remainingOrders = new Map<string, number>()
  for (const tx of existing) {
    const signature = billSignature(tx.date, tx.type, tx.amount, tx.note)
    remaining.set(signature, (remaining.get(signature) ?? 0) + 1)
    if (tx.orderId) remainingOrders.set(tx.orderId, (remainingOrders.get(tx.orderId) ?? 0) + 1)
  }

  let duplicate = 0
  let fallback = 0
  const drafts: TxDraft[] = []

  for (const row of bill.rows) {
    // 账本里存过这笔单号，就认定是同一笔，不再重复导入
    const orderLeft = row.orderId ? (remainingOrders.get(row.orderId) ?? 0) : 0
    if (row.orderId && orderLeft > 0) {
      remainingOrders.set(row.orderId, orderLeft - 1)
      duplicate += 1
      continue
    }
    const signature = billSignature(row.date, row.type, row.amount, row.note)
    const left = remaining.get(signature) ?? 0
    if (left > 0) {
      remaining.set(signature, left - 1)
      duplicate += 1
      continue
    }
    drafts.push({
      type: row.type,
      amount: row.amount,
      categoryId: row.categoryId,
      note: row.note,
      date: row.date,
      orderId: row.orderId,
    })
    if (row.categoryId === 'other' || row.categoryId === 'other-income') fallback += 1
  }

  return {
    source: bill.source,
    drafts,
    total: bill.total,
    fresh: drafts.length,
    duplicate,
    skipped: bill.skipped,
    dateFrom: bill.dateFrom,
    dateTo: bill.dateTo,
    fallback,
  }
}

export const BILL_SOURCE_LABEL: Record<BillSource, string> = {
  alipay: '支付宝',
  wechat: '微信',
}
