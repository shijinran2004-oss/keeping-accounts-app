import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Money } from './Money'
import type { SparkSummaryProps } from '../types'

/**
 * 明细页顶部的小计横条。
 *
 * 交互照搬参考实现：折线描边生长（stroke-dashoffset）、渐变面积淡入、
 * 末点呼吸光斑、卡片上一层很淡的扫光；配色换成本项目的纸色 / 朱红。
 */

/** 折线用的虚拟坐标，横向铺满、纵向固定 */
const VW = 100
const VH = 34
/** 上下留白，避免线条贴边 */
const PAD_TOP = 5
const PAD_BOTTOM = 3

function buildGeometry(points: number[]) {
  const list = points.length >= 2 ? points : [0, points[0] ?? 0]
  const max = Math.max(...list, 1)
  const span = VH - PAD_TOP - PAD_BOTTOM
  const coords = list.map((v, i) => ({
    x: (i / (list.length - 1)) * VW,
    y: VH - PAD_BOTTOM - (v / max) * span,
  }))

  // 以中点为控制点：曲线平滑，且不会像 Catmull-Rom 那样冲过极值
  let line = `M ${coords[0].x.toFixed(2)} ${coords[0].y.toFixed(2)}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i]
    const p1 = coords[i + 1]
    const cx = ((p0.x + p1.x) / 2).toFixed(2)
    line += ` C ${cx} ${p0.y.toFixed(2)}, ${cx} ${p1.y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
  }

  return {
    line,
    area: `${line} L ${VW} ${VH} L 0 ${VH} Z`,
    lastY: coords[coords.length - 1].y,
  }
}

export function SparkSummary({
  label,
  spent,
  income,
  balance,
  spentPct,
  points,
  comparePct,
}: SparkSummaryProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const drawRef = useRef<Animation | null>(null)
  const [visible, setVisible] = useState(false)

  const key = points.join(',')
  const geo = buildGeometry(points)
  const over = spentPct > 100
  const isEmpty = spent === 0

  // 绘制前先把描边整段藏起来，再用 WAAPI 让它「长」出来；
  // 不用 CSS transition 是因为首帧还没有基准值，会先反向播一次（线先出现再消失）。
  useLayoutEffect(() => {
    const el = pathRef.current
    if (!el) return
    const total = el.getTotalLength()
    drawRef.current?.cancel()
    el.style.strokeDasharray = `${total}`
    el.style.strokeDashoffset = `${total}`
    setVisible(false)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.strokeDashoffset = '0'
      setVisible(true)
      return
    }

    const anim = el.animate(
      [{ strokeDashoffset: total }, { strokeDashoffset: 0 }],
      { duration: 1150, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    drawRef.current = anim
    anim.onfinish = () => {
      el.style.strokeDashoffset = '0'
    }
    return () => anim.cancel()
  }, [key])

  // 面积比线条慢半拍淡入
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 80)
    return () => window.clearTimeout(timer)
  }, [key])

  const compare = comparePct == null ? null : Math.round(comparePct * 10) / 10
  const lastTop = `${((geo.lastY / VH) * 100).toFixed(2)}%`

  return (
    <section className="spark-card" aria-label="本期小计">
      <div className="spark-main">
        <div className="spark-top">
          <span className="spark-label">{label}</span>
          <span className={`spark-badge${over ? ' is-over' : ''}`}>
            <span className="spark-badge-dot" />
            占可支配 {Math.round(spentPct)}%
          </span>
        </div>

        <div className="spark-figure">
          <Money cents={spent} decimals="auto" />
        </div>

        <div className="spark-meta">
          <span>
            收入 <Money cents={income} decimals="auto" />
          </span>
          <span className="spark-sep">·</span>
          <span>
            收支差 <Money cents={balance} decimals="auto" />
          </span>
        </div>
      </div>

      <div className="spark-viz">
        <div className="spark-svg-wrap">
          <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c2563b" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#c2563b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="spark-grid" d={`M 0 ${VH * 0.4} H ${VW}`} />
            {!isEmpty && (
              <path className="spark-area" d={geo.area} fill="url(#sparkFill)" style={{ opacity: visible ? 1 : 0 }} />
            )}
            <path ref={pathRef} className={`spark-line${isEmpty ? ' is-empty' : ''}`} d={geo.line} />
          </svg>
          {!isEmpty && (
            <>
              <span className="spark-dot-halo" style={{ top: lastTop }} aria-hidden="true" />
              <span className="spark-dot" style={{ top: lastTop }} aria-hidden="true" />
            </>
          )}
        </div>

        <span className="spark-cmp">
          {compare == null ? (
            '暂无对比'
          ) : (
            <>
              对比上月
              <b className={compare <= 0 ? 'is-down' : 'is-up'}>
                {compare <= 0 ? '↓' : '↑'}
                {Math.abs(compare)}%
              </b>
            </>
          )}
        </span>
      </div>

      <span className="spark-sheen" aria-hidden="true" />
    </section>
  )
}
