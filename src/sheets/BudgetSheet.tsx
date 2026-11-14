import { useEffect, useState } from 'react'
import { useLedger } from '../data'
import { centsToYuanInput, parseYuan } from '../lib'
import { Sheet, useToast } from '../ui'

export function BudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveSettings } = useLedger()
  const toast = useToast()
  const [salary, setSalary] = useState('')
  const [fixed, setFixed] = useState('')

  useEffect(() => {
    if (!open) return
    setSalary(centsToYuanInput(state.settings.salary))
    setFixed(centsToYuanInput(state.settings.fixedCost))
  }, [open, state.settings.salary, state.settings.fixedCost])

  const clean = (v: string) => {
    const s = v.replace(/[^\d.]/g, '')
    const [a, ...rest] = s.split('.')
    return rest.length ? `${a}.${rest.join('').slice(0, 2)}` : a
  }

  return (
    <Sheet open={open} onClose={onClose} title="收入与预算">
      <div className="sheet-body form">
        <label className="field">
          <span>每月到手工资</span>
          <div className="money-input">
            <i>¥</i>
            <input
              value={salary}
              onChange={(e) => setSalary(clean(e.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="每月到手工资"
            />
          </div>
          <small>按实际到手金额填写，税后、扣完五险一金。</small>
        </label>
        <label className="field">
          <span>每月固定支出</span>
          <div className="money-input">
            <i>¥</i>
            <input
              value={fixed}
              onChange={(e) => setFixed(clean(e.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="每月固定支出"
            />
          </div>
          <small>房租、房贷、订阅等。只在这里扣一次，不记进日常账目。</small>
        </label>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            saveSettings({ salary: parseYuan(salary), fixedCost: parseYuan(fixed) })
            toast('预算已更新', 'success')
            onClose()
          }}
        >
          保存
        </button>
      </div>
    </Sheet>
  )
}
