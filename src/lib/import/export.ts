/**
 * 把整本账导出成 CSV（Excel 直接能开）。
 *
 * 列固定：日期、类型、分类、金额(元)、备注。
 * 金额统一两位小数、不带千分位，方便再导回其它记账软件或做表格分析。
 */
import type { LedgerState } from '../../types'

/** 需要引号的单元格：含逗号、引号、换行 */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
}

export function buildLedgerCsv(state: LedgerState): string {
  const nameOf = new Map(state.categories.map((category) => [category.id, category.name]))
  const rows = [...state.txs].sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  )
  const lines = ['日期,类型,分类,金额(元),备注']
  for (const tx of rows) {
    lines.push(
      [
        tx.date,
        tx.type === 'income' ? '收入' : '支出',
        nameOf.get(tx.categoryId) ?? '其他',
        (tx.amount / 100).toFixed(2),
        tx.note,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  // 带 BOM，Excel 打开中文不乱码；行尾用 CRLF
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

/** 例如：使劲燃的钱-流水-2026-11-20.csv */
export function ledgerCsvFileName(date: string): string {
  return '使劲燃的钱-流水-' + date + '.csv'
}
