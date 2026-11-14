import type React from 'react'
import type { BarDatum, DonutSlice } from '../types'

/** 纯 CSS 柱状图；value 单位是分，active 只改颜色，不改变柱高。 */
export function BarChart({
  data,
  height = 132,
  showLabels = true,
}: {
  data: BarDatum[]
  height?: number
  showLabels?: boolean
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className={`bar-chart ${showLabels ? 'with-labels' : ''}`} style={{ height }}>
      {data.map((d) => {
        const h = d.value > 0 ? Math.max(4, (d.value / max) * 100) : 2
        return (
          <div className="bar-col" key={d.key} title={`${d.label} · ¥${(d.value / 100).toFixed(2)}`}>
            <div className="bar-track">
              <div
                className={`bar-fill ${d.value ? '' : 'is-zero'} ${d.active ? 'is-active' : ''}`}
                style={{ height: `${h}%` }}
              />
            </div>
            {showLabels && <span className={`bar-label ${d.active ? 'is-active' : ''}`}>{d.label}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** SVG 环形图；children 放在圆心，通常用来放总支出。 */
export function Donut({
  slices,
  size = 136,
  thickness = 13,
  children,
}: {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  children?: React.ReactNode
}) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="支出分类占比">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={thickness} />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c
            const dash = Math.max(0, len - 2.5)
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-acc}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            )
            acc += len
            return el
          })}
      </svg>
      {children && <div className="donut-center">{children}</div>}
    </div>
  )
}
