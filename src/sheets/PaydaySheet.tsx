import { useEffect, useState } from 'react'
import { useLedger } from '../data'
import { cycleRange, daysBetween, formatMonth, salaryMonthLabel, todayStr } from '../lib'
import { Sheet, useToast } from '../ui'

/**
 * 发薪日设置：默认发薪日、当月/次月工资归属、本月实际到账日。
 * 底部实时预览当前预算月，保存时只把与默认日不同的月份写入 paydayOverrides。
 */
export function PaydaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveSettings } = useLedger()
  const toast = useToast()
  const [day, setDay] = useState('15')
  const [lag, setLag] = useState<0 | 1>(1)
  const [actual, setActual] = useState('15')
  const month = todayStr().slice(0, 7)

  useEffect(() => {
    if (!open) return
    const base = String(state.settings.payday ?? 15)
    setDay(base)
    setActual(String(state.settings.paydayOverrides?.[month] ?? base))
    setLag(state.settings.salaryLag === 1 ? 1 : 0)
  }, [open, month, state.settings.payday, state.settings.salaryLag, state.settings.paydayOverrides])

  const cleanDay = (v: string) => v.replace(/\D/g, '').slice(0, 2)
  const safeDay = Math.min(31, Math.max(1, Number(day) || 1))
  const safeActual = Math.min(31, Math.max(1, Number(actual) || safeDay))
  const cycle = cycleRange(todayStr(), safeDay, lag)
  const cycleDays = daysBetween(cycle.start, cycle.end) + 1

  return (
    <Sheet open={open} onClose={onClose} title="发薪日与工资归属">
      <div className="sheet-body form">
        <label className="field">
          <span>每月发薪日</span>
          <div className="money-input">
            <input
              value={day}
              onChange={(e) => {
                const next = cleanDay(e.target.value)
                if (actual === day) setActual(next)
                setDay(next)
              }}
              inputMode="numeric"
              placeholder="15"
              aria-label="每月发薪日"
            />
            <i className="is-suffix">号</i>
          </div>
          <small>1–31 号；29/30/31 遇到短月会自动按当月最后一天算。</small>
        </label>

        <label className="field">
          <span>{formatMonth(todayStr())}实际到账</span>
          <div className="money-input">
            <input
              value={actual}
              onChange={(e) => setActual(cleanDay(e.target.value))}
              inputMode="numeric"
              placeholder={String(safeDay)}
              aria-label="本月实际到账日"
            />
            <i className="is-suffix">号</i>
          </div>
          <small>
            只改这个月；下个月自动回到 {safeDay} 号。
            <button type="button" className="pay-reset" onClick={() => setActual(String(safeDay))}>
              恢复默认
            </button>
          </small>
        </label>

        <div className="field">
          <span>工资归属</span>
          <div className="segmented pay-lag" role="tablist" aria-label="工资归属">
            <button
              type="button"
              role="tab"
              aria-selected={lag === 0}
              className={lag === 0 ? 'is-active' : ''}
              onClick={() => setLag(0)}
            >
              当月发
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lag === 1}
              className={lag === 1 ? 'is-active' : ''}
              onClick={() => setLag(1)}
            >
              次月发上月
            </button>
          </div>
          <small>
            {lag === 1
              ? '例如 11 月 15 日到账的是 10 月工资；11 月整月都按 10 月工资做预算。'
              : '例如 11 月 15 日到账的是 11 月工资；11 月整月都按 11 月工资做预算。'}
          </small>
        </div>

        <div className="pay-preview">
          <span>按这个设置，预算月是</span>
          <b>{formatMonth(cycle.start)} · {salaryMonthLabel(cycle.salaryMonth)}</b>
          <em>
            共 {cycleDays} 天 · 本月 {safeActual} 号到账
          </em>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const next = { ...(state.settings.paydayOverrides ?? {}) }
            if (safeActual === safeDay) delete next[month]
            else next[month] = safeActual
            saveSettings({
              payday: safeDay,
              salaryLag: lag,
              paydaySet: true,
              paydayOverrides: Object.keys(next).length ? next : undefined,
            })
            toast('发薪日已更新', 'success')
            onClose()
          }}
        >
          保存
        </button>
      </div>
    </Sheet>
  )
}
