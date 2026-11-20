/**
 * 账单 CSV 的底层解析。
 *
 * 支付宝和微信导出的账单都是 CSV，但格式细节不同：
 * - 支付宝默认 GBK 编码，微信是带 BOM 的 UTF-8；
 * - 两家前面都有若干行说明文字，表头不在第一行；
 * - 末尾有一行全是短横线的分隔符。
 *
 * 这里只做「把文本切成行/列」和「编码、日期、金额」这类通用转换，
 * 具体是哪家账单、哪一列是什么，交给 bill.ts。
 */

/** 解码账单文件：先按 UTF-8 严格解，失败再按 GBK 解 */
export function decodeBillBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  // UTF-8 BOM：微信账单常见
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // 支付宝账单是 GBK；Android WebView 与主流浏览器都支持这个 label
    try {
      return new TextDecoder('gbk').decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes)
    }
  }
}

/**
 * 解析 CSV 文本为二维数组。
 *
 * 只处理账单导出会遇到的子集：双引号包裹、引号内逗号/换行、\r\n 换行。
 * 不做类型转换，空单元格保留空字符串。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.some((cell) => cell.trim() !== '')) rows.push(row)
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      quoted = true
      i += 1
      continue
    }
    if (ch === ',') {
      pushField()
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      pushRow()
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (field !== '' || row.length) pushRow()
  return rows
}

/** 表头行的判定：同一行里同时出现这些列名 */
export function findHeaderRow(rows: string[][], required: string[]): number {
  for (let i = 0; i < rows.length && i < 40; i += 1) {
    const cells = rows[i].map((cell) => cell.replace(/\s/g, ''))
    if (required.every((name) => cells.some((cell) => cell === name || cell.startsWith(name)))) return i
  }
  return -1
}

/** 把 2026-11-13 12:36:02 / 2026/11/13 / 2026年11月13日 收成 YYYY-MM-DD */
export function parseBillDate(raw: string): string | null {
  const text = raw.trim()
  const match = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (!match) return null
  const year = match[1]
  const month = match[2].padStart(2, '0')
  const day = match[3].padStart(2, '0')
  const monthNum = Number(month)
  const dayNum = Number(day)
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null
  return year + '-' + month + '-' + day
}

/** 把 ¥12.30 / ￥1,234.56 / 12 元 收成整数分 */
export function parseBillCents(raw: string): number | null {
  const text = raw.replace(/[¥￥,，\s元]/g, '')
  if (!text) return null
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null
  const negative = text.startsWith('-')
  const value = Math.round(Math.abs(Number(text)) * 100)
  if (!Number.isFinite(value) || value <= 0) return null
  return negative ? -value : value
}

/** 账单里同一笔的签名，用来和账本已有记录比对 */
export function billSignature(date: string, type: string, cents: number, note: string): string {
  return date + '|' + type + '|' + cents + '|' + note.replace(/\s/g, '')
}
