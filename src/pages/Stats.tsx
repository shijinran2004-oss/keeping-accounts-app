import { useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus, PieChart } from 'lucide-react'
import { useLedger } from '../data'
import {
  addDays,
  cycleRange,
  daysBetween,
  eachDay,
  endOfWeek,
  formatDay,
  formatMonth,
  parseDate,
  shiftCycle,
  startOfWeek,
  todayStr,
  weekdayLabel,
  weekdayShort,
} from '../utils'
import {
  categoryBreakdown,
  dailySeries,
  inRange,
  moneyFlow,
  previousRange,
  summarize,
} from '../utils'
import { formatMoneyShort, formatPercent } from '../utils'
import type { BarDatum, DonutSlice, StatsRange } from '../types'
import { BarChart, Donut, Empty, Money, SectionTitle } from '../components'

export function Stats({ onGoMe }: { onGoMe: () => void }) {
  const { state } = useLedger()
  const t = todayStr()
  const [kind, setKind] = useState<StatsRange>('month')
  const [anchor, setAnchor] = useState(t)

  const payday = state.settings.payday ?? 1
  const salaryLag = state.settings.salaryLag ?? 0
  const cycle = cycleRange(anchor, payday, salaryLag)

  const range =
    kind === 'day'
      ? { start: anchor, end: anchor }
      : kind === 'week'
        ? { start: startOfWeek(anchor), end: endOfWeek(anchor) }
        : { start: cycle.start, end: cycle.end }

  const list = inRange(state.txs, range.start, range.end)
  const sum = summarize(list)
  const prev =
    kind === 'month'
      ? cycleRange(addDays(cycle.start, -1), payday, salaryLag)
      : previousRange(kind, anchor)
  const prevSum = summarize(inRange(state.txs, prev.start, prev.end))
  const cats = categoryBreakdown(list, state.categories, 'expense')

  const elapsedDays =
    range.end < t ? daysBetween(range.start, range.end) + 1 : Math.max(1, Math.min(daysBetween(range.start, range.end) + 1, daysBetween(range.start, t) + 1))
  const dailyAvg = sum.expense / Math.max(1, elapsedDays)

  const diff = sum.expense - prevSum.expense
  const diffPct = prevSum.expense > 0 ? (diff / prevSum.expense) * 100 : null

  const chart = useMemo<BarDatum[]>(() => {
    if (kind === 'day') {
      return dailySeries(state.txs, addDays(anchor, -6), anchor).map((d) => ({
        key: d.date,
        label: weekdayShort(d.date),
        value: d.amount,
        active: d.date === anchor,
      }))
    }
    const series = dailySeries(state.txs, range.start, range.end)
    return series.map((d, i) => {
      const dayNum = parseDate(d.date).getDate()
      const last = i === series.length - 1
      const show = kind === 'week' || dayNum === 1 || dayNum % 5 === 0 || last
      return {
        key: d.date,
        label: kind === 'week' ? weekdayShort(d.date) : show ? String(dayNum) : '',
        value: d.amount,
        active: d.date === t,
      }
    })
  }, [state.txs, kind, anchor, range.start, range.end, t])

  const top = cats.slice(0, 5)
  const rest = cats.slice(5)
  const restTotal = rest.reduce((a, c) => a + c.amount, 0)
  const slices: DonutSlice[] = [
    ...top.map((c) => ({ label: c.category.name, value: c.amount, color: c.category.color })),
    ...(restTotal > 0 ? [{ label: '其他', value: restTotal, color: '#B9B1A2' }] : []),
  ]
  const topCat = cats[0]

  const flowDate = anchor >= cycle.start && anchor <= cycle.end ? anchor : cycle.end
  const flow = moneyFlow(state.settings, list, flowDate, cycle)
  const parts = Math.max(1, flow.spent + flow.fixedCost + Math.max(0, flow.remaining))
  const spentW = (flow.spent / parts) * 100
  const fixedW = (flow.fixedCost / parts) * 100
  const remainW = (Math.max(0, flow.remaining) / parts) * 100
  const maxExpense = list.reduce((m, tx) => (tx.type === 'expense' ? Math.max(m, tx.amount) : m), 0)
  const prevLabel = kind === 'day' ? '昨天' : kind === 'week' ? '上周' : '上月'

  const label =
    kind === 'day'
      ? `${formatDay(anchor)} ${weekdayLabel(anchor)}`
      : kind === 'week'
        ? `${formatDay(range.start)} – ${formatDay(range.end)}`
        : formatMonth(cycle.start)

  const shift = (dir: number) => {
    if (kind === 'day') setAnchor(addDays(anchor, dir))
    else if (kind === 'week') setAnchor(addDays(anchor, 7 * dir))
    else setAnchor(shiftCycle(cycle.start, dir, payday))
  }

  return (
    <div className="page stats">
      <header className="page-head">
        <div>
          <h1>统计</h1>
          <p>看清钱花在哪儿</p>
        </div>
        <div className="segmented" role="tablist" aria-label="统计周期">
          {(['day', 'week', 'month'] as StatsRange[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? 'is-active' : ''}
              onClick={() => setKind(k)}
            >
              {k === 'day' ? '日' : k === 'week' ? '周' : '月'}
            </button>
          ))}
        </div>
      </header>

      <div className="period-bar">
        <button type="button" onClick={() => shift(-1)} aria-label="上一期">
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <span>{label}</span>
        <button type="button" onClick={() => shift(1)} disabled={range.end >= t} aria-label="下一期">
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <section className="stats-summary">
        <div className="stats-total">
          <span>总支出</span>
          <Money cents={sum.expense} decimals="always" />
        </div>
        <div className={`stats-compare ${diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : ''}`}>
          {diffPct === null ? (
            prevSum.expense === 0 && sum.expense > 0 ? (
              <><Minus size={13} strokeWidth={1.8} /> {prevLabel}没有支出记录</>
            ) : (
              <><Minus size={13} strokeWidth={1.8} /> 与{prevLabel}持平</>
            )
          ) : (
            <>
              {diff > 0 ? <ArrowUpRight size={13} strokeWidth={2} /> : diff < 0 ? <ArrowDownRight size={13} strokeWidth={2} /> : <Minus size={13} strokeWidth={1.8} />}
              比{prevLabel}{diff > 0 ? '多' : diff < 0 ? '少' : ''} {formatPercent(Math.abs(diffPct), 0)}
            </>
          )}
        </div>
        <div className="stats-meta">
          <div><span>笔数</span><b>{sum.count}</b></div>
          <div><span>收入</span><b className="is-income"><Money cents={sum.income} symbol={false} decimals="never" /></b></div>
          <div>
            <span>{kind === 'day' ? '最大一笔' : '日均支出'}</span>
            <b><Money cents={kind === 'day' ? maxExpense : dailyAvg} symbol={false} decimals="never" /></b>
          </div>
        </div>
      </section>

      <section className="card chart-card">
        <div className="card-head">
          <h3>{kind === 'day' ? '近 7 天' : kind === 'week' ? '本周每日' : '本月每日'}</h3>
          <span>单位：元</span>
        </div>
        <BarChart data={chart} height={156} />
      </section>

      <section className="card cat-card">
        <div className="card-head">
          <h3>钱花在哪儿</h3>
          <span>{cats.length ? `${cats.length} 个分类` : ''}</span>
        </div>
        {cats.length === 0 ? (
          <Empty icon={PieChart} title="这段时间还没有支出" hint="记账之后，这里会长出你的消费结构。" />
        ) : (
          <div className="cat-body">
            <Donut slices={slices} size={126} thickness={13}>
              {topCat && (
                <>
                  <span>花得最多</span>
                  <b>{topCat.category.name}</b>
                  <em>{formatPercent(topCat.pct)}</em>
                </>
              )}
            </Donut>
            <div className="cat-legend">
              {top.map((c) => (
                <div className="legend-row" key={c.category.id}>
                  <i style={{ background: c.category.color }} />
                  <span className="legend-name">{c.category.name}</span>
                  <span className="legend-pct">{formatPercent(c.pct)}</span>
                  <b><Money cents={c.amount} symbol={false} decimals="never" /></b>
                </div>
              ))}
              {restTotal > 0 && (
                <div className="legend-row">
                  <i style={{ background: '#B9B1A2' }} />
                  <span className="legend-name">其他 {rest.length} 类</span>
                  <span className="legend-pct">{formatPercent((restTotal / Math.max(1, sum.expense)) * 100)}</span>
                  <b><Money cents={restTotal} symbol={false} decimals="never" /></b>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {kind === 'month' && (
      <section className="section">
        <SectionTitle>这个月的盘子</SectionTitle>
        {flow.salary > 0 ? (
          <div className="card budget-card">
            <div className="budget-top">
              <span>本月到手</span>
              <b><Money cents={flow.income} decimals="never" /></b>
            </div>
            <div className="stack-bar" aria-hidden="true">
              <i className="seg-spent" style={{ width: `${Math.min(spentW, 100)}%` }} />
              <i className="seg-fixed" style={{ width: `${Math.min(fixedW, 100 - Math.min(spentW, 100))}%` }} />
              <i className="seg-remain" style={{ width: `${Math.min(remainW, 100 - Math.min(spentW, 100) - Math.min(fixedW, 100 - Math.min(spentW, 100)))}%` }} />
            </div>
            <p className="budget-hint">
              日常支出占可支配的 <b>{formatPercent(flow.spentPct)}</b>，固定支出占工资 {formatPercent(flow.fixedPct)}。
            </p>
            <div className="budget-legend">
              <div><i className="dot-spent" /><span>日常支出</span><b><Money cents={flow.spent} symbol={false} decimals="never" /></b></div>
              <div><i className="dot-fixed" /><span>固定支出</span><b><Money cents={flow.fixedCost} symbol={false} decimals="never" /></b></div>
              <div><i className="dot-remain" /><span>{flow.remaining >= 0 ? '还能剩' : '已超支'}</span><b><Money cents={Math.abs(flow.remaining)} symbol={false} decimals="never" /></b></div>
            </div>
            <p className="budget-note">月薪 ¥{formatMoneyShort(flow.salary)} · 固定支出先扣掉，不重复记入每一笔账</p>
          </div>
        ) : (
          <div className="card">
            <Empty
              icon={PieChart}
              title="还没有设置月薪"
              hint="设置月薪和固定支出后，就能看到可支配比例。"
              action={<button className="btn-ghost sm" onClick={onGoMe} type="button">去设置</button>}
            />
          </div>
        )}
      </section>
      )}
    </div>
  )
}
