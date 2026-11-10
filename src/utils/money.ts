export function formatMoney(cents: number): string {
  const neg = cents < 0
  const abs = Math.abs(Math.round(cents))
  const yuan = Math.floor(abs / 100)
  const fen = abs % 100
  const body = yuan.toLocaleString('zh-CN')
  return `${neg ? '-' : ''}${body}${fen ? '.' + String(fen).padStart(2, '0') : '.00'}`
}

export function formatMoneyShort(cents: number): string {
  const abs = Math.abs(cents)
  if (abs >= 1e10) return `${(abs / 1e10).toFixed(1).replace(/\.0$/, '')}亿`
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(1).replace(/\.0$/, '')}万`
  return `${Math.round(abs / 100).toLocaleString('zh-CN')}`
}

/** parse a user-typed yuan string into integer cents */
export function parseYuan(input: string): number {
  const clean = input.replace(/[^\d.]/g, '')
  if (!clean) return 0
  const [a, b = ''] = clean.split('.')
  const yuan = Number(a || '0')
  const fen = Number((b + '00').slice(0, 2))
  if (!Number.isFinite(yuan) || !Number.isFinite(fen)) return 0
  return Math.round(yuan) * 100 + fen
}

export function centsToYuanInput(cents: number): string {
  if (!cents) return ''
  const abs = Math.abs(cents)
  const yuan = Math.floor(abs / 100)
  const fen = abs % 100
  return fen ? `${yuan}.${String(fen).padStart(2, '0')}` : String(yuan)
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(digits)}%`
}

/** 「128.5+45-20」这样的算式求和（单位：元）。尾部悬挂的运算符会被忽略 */
export function sumExpression(expr: string): number {
  const clean = expr.replace(/[+\-.\s]+$/, '')
  const tokens = clean.match(/[+-]?\d*\.?\d+/g)
  if (!tokens) return 0
  const total = tokens.reduce((sum, token) => sum + Number(token), 0)
  return Number.isFinite(total) ? Math.max(0, total) : 0
}

/** 算式里是否已经出现运算符（用来决定要不要显示「= 合计」） */
export function hasOperator(expr: string): boolean {
  return /[+\-]/.test(expr.slice(1))
}

/** 把算式拆成数字与运算符，渲染时好把运算符单独强调 */
export function expressionParts(expr: string): { text: string; op: boolean }[] {
  return expr
    .split(/([+\-])/)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, op: part === '+' || part === '-' }))
}

/** 数字串加千分位，保留用户正在输入的小数点（如 "12." 原样保留） */
export function formatAmountText(text: string): string {
  if (!/^\d/.test(text)) return text || '0'
  const [intPart, fracPart] = text.split('.')
  const grouped = Number(intPart || '0').toLocaleString('zh-CN')
  return fracPart === undefined ? grouped : `${grouped}.${fracPart}`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
