import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useLedger } from '../data'
import { Seal } from '../components'
import { parseYuan } from '../utils'
import { tapSuccess } from '../utils'

export function Onboarding() {
  const { saveSettings } = useLedger()
  const [salary, setSalary] = useState('')
  const [fixed, setFixed] = useState('')

  const clean = (v: string) => {
    const s = v.replace(/[^\d.]/g, '')
    const [a, ...rest] = s.split('.')
    return rest.length ? `${a}.${rest.join('').slice(0, 2)}` : a
  }

  const start = (skip = false) => {
    saveSettings({
      salary: skip ? 0 : parseYuan(salary),
      fixedCost: skip ? 0 : parseYuan(fixed),
      onboarded: true,
    })
    tapSuccess()
  }

  return (
    <div className="onboarding">
      <header className="ob-top">
        <Seal />
        <span className="ob-brand">使劲燃的钱</span>
        <span className="ob-year">2026</span>
      </header>

      <div className="ob-body">
        <p className="ob-kicker">一本不催你的小账本</p>
        <h1>
          先说说，
          <br />
          每个月到手多少？
        </h1>
        <p className="ob-sub">
          只用来算你可支配的钱。固定支出会先扣掉，
          <br />
          不重复记进每一笔账里。
        </p>

        <div className="ob-fields">
          <label className="ob-field">
            <span>每月到手工资</span>
            <div>
              <i>¥</i>
              <input
                value={salary}
                onChange={(e) => setSalary(clean(e.target.value))}
                inputMode="decimal"
                placeholder="8,000"
                aria-label="每月到手工资"
              />
            </div>
          </label>
          <label className="ob-field">
            <span>每月固定支出 <em>可选</em></span>
            <div>
              <i>¥</i>
              <input
                value={fixed}
                onChange={(e) => setFixed(clean(e.target.value))}
                inputMode="decimal"
                placeholder="2,000"
                aria-label="每月固定支出"
              />
            </div>
            <small>房租、房贷、订阅等，每个月都要付的那部分。</small>
          </label>
        </div>
      </div>

      <div className="ob-foot">
        <button type="button" className="btn-primary ob-start" disabled={!parseYuan(salary)} onClick={() => start()}>
          开始记账
        </button>
        <button type="button" className="ob-skip" onClick={() => start(true)}>
          先跳过，之后在「我的」里设置
        </button>
        <p className="ob-privacy">
          <ShieldCheck size={13} strokeWidth={1.6} /> 数据只保存在这台手机上
        </p>
        <p className="ob-quote">每一笔，都算数</p>
      </div>
    </div>
  )
}
