import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Delete, Trash2, X } from 'lucide-react'
import { useLedger } from '../data'
import type { AmountSeed, Tx, TxType } from '../types'
import {
  centsToYuanInput,
  expressionParts,
  formatAmountText,
  formatMoney,
  hasOperator,
  relativeDay,
  sumExpression,
  tap,
  tapSuccess,
  todayStr,
} from '../utils'
import { CategoryIcon, MorphSheet, useToast } from '../components'

const PAD: string[] = ['7', '8', '9', '+', '4', '5', '6', '-', '1', '2', '3', 'back', '.', '0']

export function AddSheet({
  open,
  onClose,
  editing,
  seed,
}: {
  open: boolean
  onClose: () => void
  editing?: Tx | null
  seed?: AmountSeed | null
}) {
  const { state, addTx, updateTx, deleteTx } = useLedger()
  const toast = useToast()
  const [type, setType] = useState<TxType>('expense')
  const [expr, setExpr] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayStr())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState(false)

  const pickCategory = (next: TxType) => {
    const list = state.categories.filter((c) => c.type === next)
    const last = [...state.txs]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
      .find((t) => t.type === next)
    if (last && list.some((c) => c.id === last.categoryId)) return last.categoryId
    return list[0]?.id ?? ''
  }

  useEffect(() => {
    if (!open) return
    setSaved(false)
    setConfirmDelete(false)
    if (editing) {
      setType(editing.type)
      setExpr(centsToYuanInput(editing.amount))
      setCategoryId(editing.categoryId)
      setNote(editing.note)
      setDate(editing.date)
    } else {
      const nextType = seed?.type ?? 'expense'
      setType(nextType)
      setExpr('')
      setNote('')
      setDate(todayStr())
      setCategoryId(seed?.categoryId ?? pickCategory(nextType))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, seed])

  const categories = useMemo(() => state.categories.filter((c) => c.type === type), [state.categories, type])
  const current = categories.find((c) => c.id === categoryId) ?? categories[0]
  const total = sumExpression(expr)
  const cents = Math.round(total * 100)
  const parts = expressionParts(expr)
  const showTotal = hasOperator(expr)

  const changeType = (next: TxType) => {
    if (next === type) return
    tap()
    setType(next)
    if (!categories.some((c) => c.id === categoryId)) setCategoryId(pickCategory(next))
  }

  const press = (key: string) => {
    if (saved) return
    tap()
    setExpr((prev) => {
      if (key === 'back') return prev.slice(0, -1)
      if (key === '+' || key === '-') {
        if (!prev) return prev
        if (/[+\-]$/.test(prev)) return prev.slice(0, -1) + key
        if (prev.endsWith('.')) return prev.slice(0, -1) + key
        return prev + key
      }
      const operand = prev.split(/[+\-]/).pop() ?? ''
      if (key === '.') {
        if (operand === '') return prev + '0.'
        return operand.includes('.') ? prev : prev + '.'
      }
      const [intPart, fracPart] = operand.split('.')
      if (fracPart !== undefined && fracPart.length >= 2) return prev
      if (fracPart === undefined && intPart.length >= 8) return prev
      if (operand === '0') return prev.slice(0, -1) + key
      return prev + key
    })
  }

  const submit = () => {
    if (saved) return
    if (!cents || !current) {
      toast('先输入金额和分类', 'error')
      return
    }
    const draft = { type, amount: cents, categoryId: current.id, note: note.trim(), date }
    if (editing) {
      updateTx(editing.id, draft)
    } else {
      addTx(draft)
      tapSuccess()
    }
    setSaved(true)
    window.setTimeout(() => onClose(), 760)
  }

  const remove = () => {
    if (!editing) return
    deleteTx(editing.id)
    toast('已删除这笔记录')
    onClose()
  }

  return (
    <MorphSheet open={open} onClose={onClose} label={editing ? '编辑这一笔' : '记一笔'}>
      <div className="qa">
        <div className="qa-grab" />

        <header className="qa-head">
          <button className="qa-icon" onClick={onClose} aria-label="关闭" type="button">
            <X size={17} strokeWidth={2} />
          </button>
          <div className="qa-seg" role="tablist" aria-label="收支类型">
            <button
              type="button"
              role="tab"
              aria-selected={type === 'expense'}
              className={type === 'expense' ? 'is-active' : ''}
              onClick={() => changeType('expense')}
            >
              支出
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={type === 'income'}
              className={type === 'income' ? 'is-active' : ''}
              onClick={() => changeType('income')}
            >
              收入
            </button>
          </div>
          {editing ? (
            <button className="qa-icon" onClick={() => setConfirmDelete((v) => !v)} aria-label="删除这笔" type="button">
              <Trash2 size={16} strokeWidth={1.9} />
            </button>
          ) : (
            <span className="qa-icon is-ghost" />
          )}
        </header>

        <div className="qa-card">
          <div className="qa-cat">
            <span
              className="qa-tile"
              style={{ background: current?.color ?? 'var(--mint)' } as React.CSSProperties}
              aria-hidden="true"
            >
              {current && <CategoryIcon name={current.icon} size={19} />}
            </span>
            <div className="qa-cat-text">
              <b>{current?.name ?? '未选择'}</b>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="加个备注…"
                maxLength={30}
                aria-label="备注"
              />
            </div>
          </div>

          <div className="qa-amount">
            <div className={`qa-figure ${expr ? '' : 'is-empty'} ${expr.length > 10 ? 'is-long' : ''}`}>
              <span className="qa-yen">¥</span>
              {parts.length === 0 ? (
                <span className="qa-num">0</span>
              ) : (
                parts.map((p, i) =>
                  p.op ? (
                    <span className="qa-op" key={i}>
                      {p.text}
                    </span>
                  ) : (
                    <span className="qa-num" key={i}>
                      {formatAmountText(p.text)}
                    </span>
                  ),
                )
              )}
            </div>
            {showTotal && <div className="qa-total">= ¥{formatMoney(cents)}</div>}
          </div>
        </div>

        <div className="qa-meta">
          <label className="qa-date">
            <CalendarDays size={13} strokeWidth={1.9} />
            <span>{relativeDay(date)}</span>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value || todayStr())}
              aria-label="日期"
            />
          </label>
          <span className="qa-tip">
            {editing ? '改完点「保存」' : '可以按 + − 连着算，比如 128+45'}
          </span>
        </div>

        <div className="qa-cats" role="tablist" aria-label="分类">
          {categories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              role="tab"
              aria-selected={current?.id === cat.id}
              className={`qa-chip ${current?.id === cat.id ? 'is-on' : ''}`}
              onClick={() => {
                tap()
                setCategoryId(cat.id)
              }}
            >
              <span className="qa-chip-tile" style={{ background: cat.color } as React.CSSProperties} aria-hidden="true">
                <CategoryIcon name={cat.icon} size={14} />
              </span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {confirmDelete ? (
          <div className="qa-confirm">
            <span>删除后无法恢复</span>
            <div>
              <button type="button" className="qa-ghost" onClick={() => setConfirmDelete(false)}>
                取消
              </button>
              <button type="button" className="qa-danger" onClick={remove}>
                删除
              </button>
            </div>
          </div>
        ) : (
          <div className="qa-pad">
            {PAD.map((key) =>
              key === 'back' ? (
                <button type="button" className="qk qk-fn" key={key} onClick={() => press(key)} aria-label="退格">
                  <Delete size={20} strokeWidth={1.9} />
                </button>
              ) : key === '+' || key === '-' ? (
                <button type="button" className="qk qk-fn" key={key} onClick={() => press(key)} aria-label={key === '+' ? '加' : '减'}>
                  {key}
                </button>
              ) : (
                <button type="button" className="qk" key={key} onClick={() => press(key)}>
                  {key}
                </button>
              ),
            )}
            <button
              type="button"
              className={`qa-save ${saved ? 'is-saved' : ''}`}
              onClick={submit}
              disabled={!cents || !current}
            >
              {saved ? (
                <>
                  <Check size={17} strokeWidth={2.6} /> 已记一笔
                </>
              ) : (
                '保存'
              )}
            </button>
          </div>
        )}
      </div>
    </MorphSheet>
  )
}
