import type { Category, Tx } from '../types'
import { CategoryIcon } from './Icon'
import { Money } from './Money'
import { relativeDay } from '../utils/date'
import type React from 'react'

export function TxRow({
  tx,
  category,
  showDate = false,
  onClick,
}: {
  tx: Tx
  category: Category
  showDate?: boolean
  onClick?: () => void
}) {
  const income = tx.type === 'income'
  const title = tx.note.trim() || category.name
  const sub = [showDate ? relativeDay(tx.date) : '', category.name].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      className="tx-row"
      onClick={onClick}
      style={{ ['--cat' as string]: category.color } as React.CSSProperties}
    >
      <span className="cat-tile">
        <CategoryIcon name={category.icon} size={18} />
      </span>
      <span className="tx-main">
        <span className="tx-title">{title}</span>
        <span className="tx-sub">{sub}</span>
      </span>
      <span className={`tx-amount ${income ? 'is-income' : ''}`}>
        <span className="tx-sign">{income ? '+' : '−'}</span>
        <Money cents={tx.amount} symbol={false} />
      </span>
    </button>
  )
}
