import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type { CalendarCell, MonthCalendarProps } from '../types'
import { formatCompactAmount, formatMonth, todayStr } from '../utils'
import type { CSSProperties } from 'react'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function cellLabel(cell: CalendarCell): string {
  const parts = [`${cell.day} 日`]
  if (cell.expense) parts.push(`支出 ${(cell.expense / 100).toFixed(2)} 元`)
  if (cell.income) parts.push(`收入 ${(cell.income / 100).toFixed(2)} 元`)
  if (!cell.count) parts.push('没有记录')
  if (cell.isPayday) parts.push('发薪日')
  return parts.join('，')
}

/**
 * 明细页的月历：日期格子下面带当日金额（或极简圆点），
 * 可以切上/下月、回到今天、只展开选中那一周。
 */
export function MonthCalendar({
  month,
  selected,
  cells,
  mode,
  weekOnly,
  onChangeMonth,
  onSelect,
  onToday,
  onMode,
  onToggleWeek,
  title,
  caption,
}: MonthCalendarProps) {
  const today = todayStr()
  const selectedRow = Math.max(0, Math.floor(cells.findIndex((c) => c.date === selected) / 7))
  const shown = weekOnly ? cells.slice(selectedRow * 7, selectedRow * 7 + 7) : cells

  return (
    <section className="cal-card" aria-label="账单日历">
      <div className="cal-head">
        <div className="cal-month">
          <button type="button" className="cal-nav" onClick={() => onChangeMonth(-1)} aria-label="上个月">
            <ChevronLeft size={17} strokeWidth={1.9} />
          </button>
          <span className="cal-title">{title ?? formatMonth(month)}</span>
          <button type="button" className="cal-nav" onClick={() => onChangeMonth(1)} aria-label="下个月">
            <ChevronRight size={17} strokeWidth={1.9} />
          </button>
          <button type="button" className="cal-today-jump" onClick={onToday}>
            今
          </button>
        </div>

        <div className="cal-mode" role="group" aria-label="日历显示方式">
          <button
            type="button"
            aria-pressed={mode === 'amount'}
            className={mode === 'amount' ? 'is-active' : ''}
            onClick={() => onMode('amount')}
          >
            金额
          </button>
          <button
            type="button"
            aria-pressed={mode === 'dot'}
            className={mode === 'dot' ? 'is-active' : ''}
            onClick={() => onMode('dot')}
          >
            圆点
          </button>
        </div>
      </div>
      {caption && <div className="cal-caption">{caption}</div>}

      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i >= 5 ? 'is-weekend' : ''}>
            {w}
          </span>
        ))}
      </div>

      <div className="cal-grid" key={month}>
        {shown.map((cell) => {
          const net = cell.income - cell.expense
          const isSelected = cell.date === selected
          const isToday = cell.date === today
          const classes = ['cal-cell']
          if (!cell.inMonth) classes.push('is-out')
          if (isSelected) classes.push('is-sel')
          if (isToday) classes.push('is-today')
          if (cell.isPayday && cell.inMonth) classes.push('is-pay')
          if (cell.payFill && cell.payFill > 0) classes.push('has-payfill')

          return (
            <button
              key={cell.date}
              type="button"
              className={classes.join(' ')}
              onClick={() => onSelect(cell.date)}
              aria-pressed={isSelected}
              aria-label={cellLabel(cell)}
              style={{ ['--cal-day' as string]: cell.day, ['--pay-fill' as string]: `${cell.payFill ?? 0}%` } as CSSProperties}
            >
              {isToday && <span className="cal-today-dot" aria-hidden="true" />}
              <span className="cal-num">{cell.day}</span>
              {mode === 'amount' ? (
                cell.count > 0 ? (
                  <span className={`cal-amt ${net > 0 ? 'is-pos' : ''}`}>{formatCompactAmount(net)}</span>
                ) : (
                  <span className="cal-amt is-blank">0</span>
                )
              ) : (
                <span className={`cal-dot ${cell.count > 0 ? (net > 0 ? 'is-pos' : '') : 'is-blank'}`} />
              )}
            </button>
          )
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-pay" aria-hidden="true">薪</span>
        <span>发薪日</span>
        <span className="cal-legend-fill" aria-hidden="true" />
        <span>到发薪日</span>
      </div>

      <button type="button" className="cal-toggle" onClick={onToggleWeek}>
        {weekOnly ? '展开完整月视图' : '收起为周视图'}
        {weekOnly ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronUp size={13} strokeWidth={2} />}
      </button>
    </section>
  )
}
