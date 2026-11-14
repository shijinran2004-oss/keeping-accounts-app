import { useEffect, useState, type CSSProperties } from 'react'
import { AlertTriangle, PencilLine, Trash2 } from 'lucide-react'
import type { TxDetailSheetProps } from '../types'
import { findCategory, useLedger } from '../data'
import { formatDayLong, formatMoney, relativeDay } from '../lib'
import { CategoryIcon } from '../ui'
import { Sheet } from '../ui'
import { useToast } from '../ui'

/** 点流水后先看详情，再决定要不要改；修改会打开复用的记账框。 */
export function TxDetailSheet({ tx, onClose, onEdit }: TxDetailSheetProps) {
  const { state, deleteTx } = useLedger()
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setConfirming(false)
  }, [tx?.id])

  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), 3200)
    return () => window.clearTimeout(timer)
  }, [confirming])

  if (!tx) return null

  const category = findCategory(state.categories, tx.categoryId)
  const income = tx.type === 'income'
  const title = tx.note.trim() || category.name
  const remove = () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    deleteTx(tx.id)
    toast('已删除这笔记录')
    onClose()
  }

  const time =
    tx.createdAt > 0
      ? new Date(tx.createdAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : ''

  return (
    <Sheet open onClose={onClose} title="这笔记录">
      <div className="sheet-body tx-detail">
        <div className="tx-detail-hero">
          <span
            className="cat-tile"
            style={{ ['--cat' as string]: category.color } as CSSProperties}
          >
            <CategoryIcon name={category.icon} size={20} />
          </span>
          <div className="tx-detail-main">
            <b>{title}</b>
            <span>
              {relativeDay(tx.date)} · {category.name}
            </span>
          </div>
          <span className={`tx-detail-amount ${income ? 'is-income' : ''}`}>
            {income ? '+' : '−'}¥{formatMoney(tx.amount)}
          </span>
        </div>

        <div className="tx-detail-rows">
          <div className="tx-detail-row">
            <span>类型</span>
            <b>{income ? '收入' : '支出'}</b>
          </div>
          <div className="tx-detail-row">
            <span>分类</span>
            <b>{category.name}</b>
          </div>
          {tx.note.trim() ? (
            <div className="tx-detail-row">
              <span>备注</span>
              <b>{tx.note}</b>
            </div>
          ) : null}
          <div className="tx-detail-row">
            <span>日期</span>
            <b>{formatDayLong(tx.date)}</b>
          </div>
          {time ? (
            <div className="tx-detail-row">
              <span>记录时间</span>
              <b>{time}</b>
            </div>
          ) : null}
        </div>

        <div className="tx-detail-actions">
          <button className="btn-primary tx-detail-edit" type="button" onClick={() => onEdit(tx)}>
            <PencilLine size={16} strokeWidth={1.9} />
            修改金额
          </button>
          <button
            className={`tx-detail-delete${confirming ? ' is-confirming' : ''}`}
            type="button"
            onClick={remove}
          >
            {confirming ? (
              <AlertTriangle size={16} strokeWidth={1.9} />
            ) : (
              <Trash2 size={16} strokeWidth={1.9} />
            )}
            {confirming ? '确认删除' : '删除'}
          </button>
        </div>
        <p className="tx-detail-hint">
          {confirming
            ? '再点一次确认删除，删掉后无法恢复。'
            : '修改会打开记账框；删除需要再点一次确认。'}
        </p>
      </div>
    </Sheet>
  )
}
