import { useEffect, useState } from 'react'
import { PawPrint } from 'lucide-react'
import { CategoryIcon } from './Icon'
import { Seal } from './Seal'
import { formatMoney, tap, tapSuccess } from '../utils'
import type { ReceiptData } from '../types'

/** 各阶段时间点，单位 ms */
const T = {
  print: 380,
  stamp: 1150,
  leave: 2300,
  done: 2600,
}

type Stage = 'coin' | 'printing' | 'done' | 'out'

/**
 * 记账成功小票：金币落槽 → 小票从出票口升起 → 砸章 → 收起。
 * 面板本身就是那台机器（炭黑），票据是纸，颜色沿用纸/朱砂。
 */
export function SuccessReceipt({ data, onDone }: { data: ReceiptData; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>('coin')

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setStage('done')
      const t = window.setTimeout(onDone, 1200)
      return () => window.clearTimeout(t)
    }

    tap()
    const timers = [
      window.setTimeout(() => setStage('printing'), T.print),
      window.setTimeout(() => {
        setStage('done')
        tapSuccess()
      }, T.stamp),
      window.setTimeout(() => setStage('out'), T.leave),
      window.setTimeout(onDone, T.done),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [onDone])

  const amount = formatMoney(data.amount).replace(/^¥/, '')
  const serial = `NO. ${data.dateTime.replace(/[^0-9]/g, '').slice(2) || '000000'}`

  return (
    <div
      className={`rcp ${stage === 'out' ? 'is-out' : ''}`}
      onClick={onDone}
      role="button"
      tabIndex={-1}
      aria-label="记账成功，轻点收起"
    >
      <div className="rcp-cap">
        <Seal className="rcp-seal" />
        <span className="rcp-cap-text">{data.mode === 'create' ? '这一笔记下了' : '这一笔改好了'}</span>
      </div>

      <div className="rcp-machine">
        <div className="rcp-window">
          <article className={`rcp-paper ${stage !== 'coin' ? 'is-print' : ''}`}>
            <div className="rcp-perf" />
            <header className="rcp-head">
              <span className="rcp-brand">使劲燃的钱</span>
              <span className="rcp-kind">{data.mode === 'create' ? '记账凭证' : '修改凭证'}</span>
            </header>

            <div className="rcp-amount">
              <span className="rcp-yen">¥</span>
              <span className="rcp-figure">{amount}</span>
            </div>

            <div className="rcp-cat">
              <span className="rcp-tile" style={{ background: data.categoryColor }}>
                <CategoryIcon name={data.categoryIcon} size={15} strokeWidth={1.9} />
              </span>
              <span className="rcp-cat-name">{data.categoryName}</span>
            </div>

            {data.note ? <p className="rcp-note">{data.note}</p> : null}

            <div className="rcp-rows">
              <div className="rcp-row">
                <span>时间</span>
                <b>{data.dateTime}</b>
              </div>
              <div className="rcp-row">
                <span>连续记账</span>
                <b>{data.streak} 天</b>
              </div>
            </div>

            <div className="rcp-code" aria-hidden="true" />
            <p className="rcp-serial">{serial}</p>
            <p className="rcp-foot">每一笔，都算数</p>

            <span className={`rcp-stamp ${stage === 'done' || stage === 'out' ? 'is-in' : ''}`}>
              <PawPrint size={17} strokeWidth={2.1} aria-hidden="true" />
              <b>{data.mode === 'create' ? '已入账' : '已更新'}</b>
            </span>
          </article>
        </div>

        <div className="rcp-slot" aria-hidden="true">
          <span className="rcp-slot-lip" />
        </div>

        {stage === 'coin' ? (
          <span className="rcp-coin" aria-hidden="true">
            ¥
          </span>
        ) : null}
      </div>

      <p className="rcp-hint">轻点任意处收起</p>
    </div>
  )
}
