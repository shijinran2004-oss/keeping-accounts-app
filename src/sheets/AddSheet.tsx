import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Delete, ScanLine, Trash2, X } from 'lucide-react'
import { useLedger } from '../data'
import type { AmountSeed, CaptureImage, OcrDraft, ReceiptData, Tx, TxType } from '../types'
import {
  centsToYuanInput,
  expressionParts,
  formatAmountText,
  formatMoney,
  hasOperator,
  relativeDay,
  streakDays,
  sumExpression,
  tap,
  tapSuccess,
  todayStr,
  warmUpOcr,
  fileToOcrDataUrl,
  ocrAvailable,
  parseReceipt,
  recognizeReceipt,
} from '../lib'
import { CategoryIcon, useToast } from '../ui'
import { MorphSheet } from './MorphSheet'
import { SuccessReceipt } from './SuccessReceipt'

const PAD: string[] = ['7', '8', '9', '+', '4', '5', '6', '-', '1', '2', '3', 'back', '.', '0']

/**
 * 记一笔 / 编辑弹层：算式键盘、分类胶囊、日期与备注都在这里。
 * 保存后把一次性快照交给 SuccessReceipt 出票；编辑时预填原记录。
 */
export function AddSheet({
  open,
  onClose,
  editing,
  seed,
  capture,
  onCaptureUsed,
}: {
  open: boolean
  onClose: () => void
  editing?: Tx | null
  seed?: AmountSeed | null
  /** 分享或截图进来的图：打开弹层时自动识别一次 */
  capture?: CaptureImage | null
  onCaptureUsed?: () => void
}) {
  const { state, addTx, updateTx, deleteTx } = useLedger()
  const toast = useToast()
  const [type, setType] = useState<TxType>('expense')
  const [expr, setExpr] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayStr())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [scanning, setScanning] = useState(false)
  const [ocrDraft, setOcrDraft] = useState<OcrDraft | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [canScan] = useState(() => ocrAvailable())

  // 数字跳跃：每次敲键让金额整体上跳一下再落回，连打时重跑而不是叠加
  const figureRef = useRef<HTMLDivElement>(null)
  const popAnim = useRef<Animation | null>(null)
  const lastExpr = useRef('')

  useEffect(() => {
    if (!open) {
      lastExpr.current = ''
      return
    }
    if (lastExpr.current === expr) return
    lastExpr.current = expr
    const el = figureRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    popAnim.current?.cancel()
    popAnim.current = el.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(-2.5px) scale(1.045)', offset: 0.42 },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 210, easing: 'cubic-bezier(.2,.9,.3,1)' },
    )
  }, [expr, open])

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
    setReceipt(null)
    setConfirmDelete(false)
    setOcrDraft(null)
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
    if (receipt) return
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

  // 页面打开时先把模型读进内存，第一次识别能少等几秒
  useEffect(() => {
    if (open && canScan) void warmUpOcr()
  }, [open, canScan])

  /** 识别结果填表：拍照、分享、截图走的是同一套回填 */
  const applyDraft = (draft: OcrDraft) => {
    setOcrDraft(draft)
    if (draft.amountCents) setExpr(centsToYuanInput(draft.amountCents))
    if (draft.date) setDate(draft.date)
    if (draft.merchant) setNote(draft.merchant.slice(0, 30))
    if (draft.categoryId && state.categories.some((c) => c.id === draft.categoryId && c.type === 'expense')) {
      if (type !== 'expense') setType('expense')
      setCategoryId(draft.categoryId)
    }
    if (draft.amountCents) tapSuccess()
    else toast('金额没认出来，手动补一下', 'error')
  }

  const runOcr = async (dataUrl: string) => {
    setScanning(true)
    setOcrDraft(null)
    try {
      const result = await recognizeReceipt(dataUrl)
      applyDraft(parseReceipt(result.lines))
    } catch (error) {
      toast(error instanceof Error ? error.message : '识别失败了，手动记吧', 'error')
    } finally {
      setScanning(false)
    }
  }

  /** 截图监听已经把文字识别过了，这里只解析文字，不再对图片跑一遍模型 */
  const runText = (text: string) => {
    setScanning(true)
    setOcrDraft(null)
    try {
      const lines = text.split(/\r?\n/).map((line) => ({ text: line, score: 1, box: [] }))
      applyDraft(parseReceipt(lines))
    } finally {
      setScanning(false)
    }
  }

  const scanReceipt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 12 * 1024 * 1024) {
      toast('这张图太大了，换一张试试', 'error')
      return
    }
    try {
      await runOcr(await fileToOcrDataUrl(file))
    } catch {
      toast('这张图片读不了，换一张试试', 'error')
    }
  }

  // 分享进来、或从截图通知点进来的图：打开弹层后立刻认一次，同一张不重复认
  const usedCapture = useRef<CaptureImage | null>(null)
  useEffect(() => {
    if (!open || !capture) return
    if (usedCapture.current === capture) return
    usedCapture.current = capture
    if (capture.text?.trim()) runText(capture.text)
    else void runOcr(capture.dataUrl)
    onCaptureUsed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, capture])
  const submit = () => {
    if (receipt) return
    if (!cents || !current) {
      toast('先输入金额和分类', 'error')
      return
    }
    const draft = { type, amount: cents, categoryId: current.id, note: note.trim(), date }
    if (editing) {
      updateTx(editing.id, draft)
    } else {
      addTx(draft)
    }
    const now = new Date()
    setReceipt({
      amount: cents,
      categoryName: current.name,
      categoryIcon: current.icon,
      categoryColor: current.color,
      note: note.trim(),
      dateTime: `${date} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      streak: streakDays(
        editing ? state.txs : [...state.txs, { ...draft, id: 'pending', createdAt: 0 }],
        date,
      ),
      mode: editing ? 'edit' : 'create',
      avatar: state.settings.avatar,
    })
  }

  const remove = () => {
    if (!editing) return
    deleteTx(editing.id)
    toast('已删除这笔记录')
    onClose()
  }

  const kid = editing ? '编辑这一笔' : '记一笔'

  if (receipt) {
    return (
      <MorphSheet open={open} onClose={onClose} label={kid}>
        <SuccessReceipt data={receipt} onDone={onClose} />
      </MorphSheet>
    )
  }

  return (
    <MorphSheet open={open} onClose={onClose} label={kid}>
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
              key={current?.id ?? 'none'}
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
            <div
              className={`qa-figure ${expr ? '' : 'is-empty'} ${expr.length > 10 ? 'is-long' : ''}`}
              ref={figureRef}
            >
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

        {ocrDraft && (
          <div className="qa-ocr">
            <ScanLine size={13} strokeWidth={1.9} />
            <span>
              已识别：{ocrDraft.amountCents ? `¥${formatMoney(ocrDraft.amountCents)}` : '金额没认出来'}
              {ocrDraft.date ? ` · ${relativeDay(ocrDraft.date)}` : ''}
              {ocrDraft.merchant ? ` · ${ocrDraft.merchant}` : ''}
            </span>
            <button type="button" className="qa-ocr-x" onClick={() => setOcrDraft(null)} aria-label="忽略识别结果">
              ×
            </button>
          </div>
        )}

        {ocrDraft && ocrDraft.warnings.length > 0 && (
          <div className="qa-ocr-warn" role="status">
            <AlertTriangle size={13} strokeWidth={1.9} />
            <span>{ocrDraft.warnings[0]}</span>
          </div>
        )}

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
          {canScan && (
            <>
              <button
                type="button"
                className={`qa-scan ${scanning ? 'is-busy' : ''}`}
                onClick={() => fileRef.current?.click()}
                disabled={scanning}
              >
                {scanning ? <span className="spin" /> : <ScanLine size={13} strokeWidth={1.9} />}
                {scanning ? '识别中' : '拍小票'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="qa-file"
                onChange={scanReceipt}
                aria-label="选择小票图片"
              />
            </>
          )}
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
            <button type="button" className="qa-save" onClick={submit} disabled={!cents || !current}>
              保存
            </button>
          </div>
        )}
      </div>
    </MorphSheet>
  )
}
