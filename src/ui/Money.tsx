import { formatMoney } from '../lib'

/**
 * 金额展示：内部一律是「分」，这里只负责拆成整数/小数、弱化小数位、处理负号。
 * decimals="auto" 时只有存在角分才显示两位；tone 只影响颜色，不参与计算。
 */
export function Money({
  cents,
  className = '',
  symbol = true,
  decimals = 'auto',
  tone,
}: {
  cents: number
  className?: string
  symbol?: boolean
  decimals?: 'auto' | 'always' | 'never'
  tone?: 'expense' | 'income' | 'plain'
}) {
  const raw = formatMoney(cents)
  const [signedInt, fracPart] = raw.split('.')
  const negative = signedInt.startsWith('-')
  const intPart = negative ? signedInt.slice(1) : signedInt
  const showFrac = decimals === 'always' || (decimals === 'auto' && fracPart !== '00')
  return (
    <span className={`money ${negative ? 'is-negative' : ''} ${tone ? `money-${tone}` : ''} ${className}`}>
      {negative && <span className="money-neg">−</span>}
      {symbol && <span className="money-sym">¥</span>}
      <span className="money-int">{intPart}</span>
      {showFrac && <span className="money-frac">.{fracPart}</span>}
    </span>
  )
}
