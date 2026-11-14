import { useEffect, useState, type CSSProperties } from 'react'
import { Bookmark, ChevronRight, ReceiptText, Settings, Target } from 'lucide-react'
import { DEFAULT_LEDGER_NAME, EXPENSE_CATEGORIES, findCategory, useLedger } from '../data'
import {
  categoryBreakdown,
  cycleRange,
  daysBetween,
  effectivePayday,
  formatDay,
  formatMonth,
  formatPercent,
  greeting,
  inRange,
  moneyFlow,
  nextPayday,
  salaryMonthLabel,
  toDateStr,
  weekdayLabel,
} from '../lib'
import type { DogMood, Tx } from '../types'
import { CategoryIcon, Doghouse, Empty, Money, TxRow } from '../ui'

export function Home({
  onAdd,
  onOpenTx,
  onGoLedger,
  onGoStats,
  onGoMe,
  onQuickAdd,
}: {
  onAdd: () => void
  onOpenTx: (tx: Tx) => void
  onGoLedger: () => void
  onGoStats: () => void
  onGoMe: () => void
  onQuickAdd: (categoryId: string) => void
}) {
  const { state } = useLedger()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = window.setInterval(tick, 30_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  const today = toDateStr(now)
  const ledgerName = state.settings.name?.trim() || DEFAULT_LEDGER_NAME
  const payday = state.settings.payday ?? 15
  const salaryLag = state.settings.salaryLag ?? 1
  const overrides = state.settings.paydayOverrides
  const cycle = cycleRange(today, payday, salaryLag)
  const cycleTxs = inRange(state.txs, cycle.start, cycle.end)
  const flow = moneyFlow(state.settings, cycleTxs, today, cycle)
  const salaryLabel = salaryMonthLabel(cycle.salaryMonth)
  const actualDay = effectivePayday(today, payday, overrides)
  const nextPay = nextPayday(today, payday, overrides)
  const daysToPayday = Math.max(0, daysBetween(today, nextPay))
  const isThisPayMonth = nextPay.slice(0, 7) === today.slice(0, 7)
  const nextMonthDay = effectivePayday(nextPay, payday, overrides)
  const recent = [...state.txs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 5)
  const used = categoryBreakdown(cycleTxs, state.categories, 'expense')
  const quick =
    used.length > 0
      ? [...used]
          .sort((a, b) => b.count - a.count || b.amount - a.amount)
          .slice(0, 4)
          .map((u) => u.category)
      : EXPENSE_CATEGORIES.slice(0, 4)

  const yuan = (cents: number) => Math.round(cents / 100).toLocaleString('zh-CN')
  const spentPct = Math.max(0, flow.spentPct)
  const fixedPct = flow.salary > 0 ? (flow.fixedCost / flow.salary) * 100 : 0
  const remainPct = flow.available > 0 ? (Math.max(0, flow.remaining) / flow.available) * 100 : 0
  const todayLabel = `${formatDay(today)} · ${weekdayLabel(today)}`
  const [dancing, setDancing] = useState(false)
  useEffect(() => {
    if (!dancing) return
    const timer = window.setTimeout(() => setDancing(false), 2600)
    return () => window.clearTimeout(timer)
  }, [dancing])
  const baseMood: DogMood = spentPct >= 86 ? 'panic' : spentPct >= 50 ? 'alert' : 'peaceful'
  const dogMood: DogMood = dancing ? 'dance' : baseMood
  const dogLine = dancing
    ? '小金库回血 · 屋顶跳舞'
    : baseMood === 'panic'
      ? '余额告急 · 狗屋在晃'
      : baseMood === 'alert'
        ? '预算过半 · 坐着盯账'
        : '预算充裕 · 屋顶好眠'

  return (
    <div className="page home">
      <header className="home-hero">
        <div className="home-hero-art">
          <Doghouse mood={dogMood} onClick={() => setDancing(true)} />
        </div>
        <div className="home-hero-copy">
          <span className="home-hero-date">
            {greeting(now)} · {todayLabel}
          </span>
          <h1 title={ledgerName}>{ledgerName}</h1>
          <span className={`home-hero-state is-${dogMood}`}>
            <i />
            {dogLine}
          </span>
        </div>
        <button className="home-hero-gear" onClick={onGoMe} aria-label="我的" type="button">
          <Settings size={16} strokeWidth={1.9} />
        </button>
      </header>

      <section className="og-card" aria-label="本期预算">
        <div className="og-card-head">
          <span className="og-tile is-orange">
            <Target size={20} strokeWidth={1.9} />
          </span>
          <div className="og-card-copy">
            <span className="og-eyebrow">
              {formatMonth(cycle.start)} · 已用 {formatPercent(spentPct)}
            </span>
            <h2>本月预算</h2>
          </div>
          <button className="og-icon-btn" onClick={onGoStats} aria-label="查看统计" type="button">
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>
        <p className="og-cycle">
          {salaryLabel} ·{' '}
          {isThisPayMonth ? (
            <>
              本月 {actualDay} 号到账 ·{' '}
              {daysToPayday === 0 ? '今天发薪' : `${daysToPayday} 天后发薪`}
            </>
          ) : (
            <>本月 {actualDay} 号已到账 · 下月 {nextMonthDay} 号发薪</>
          )}
        </p>

        <div className="og-meters">
          <div className="og-meter">
            <div className="og-meter-top">
              <span>日常支出</span>
              <b>
                ¥{yuan(flow.spent)} <em>/ ¥{yuan(flow.available)}</em>
              </b>
            </div>
            <i>
              <em style={{ width: `${Math.min(100, spentPct)}%` }} />
            </i>
          </div>
          <div className="og-meter">
            <div className="og-meter-top">
              <span>固定支出</span>
              <b>
                ¥{yuan(flow.fixedCost)} <em>/ ¥{yuan(flow.salary)}</em>
              </b>
            </div>
            <i>
              <em style={{ width: `${Math.min(100, fixedPct)}%` }} />
            </i>
          </div>
          <div className="og-meter is-green">
            <div className="og-meter-top">
              <span>本月还剩</span>
              <b>
                ¥{yuan(Math.max(0, flow.remaining))} <em>可用</em>
              </b>
            </div>
            <i>
              <em style={{ width: `${Math.min(100, Math.max(0, remainPct))}%` }} />
            </i>
          </div>
        </div>
      </section>

      <section className="og-card" aria-label="常记分类">
        <div className="og-card-head">
          <span className="og-tile is-blue">
            <Bookmark size={19} strokeWidth={1.9} />
          </span>
          <div className="og-card-copy">
            <span className="og-eyebrow">最常记</span>
            <h2>常记分类</h2>
          </div>
          <button className="og-link" onClick={onGoLedger} type="button">
            全部
          </button>
        </div>

        <div className="og-quick">
          {quick.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="og-quick-tile"
              onClick={() => onQuickAdd(cat.id)}
            >
              <span
                className="og-tile is-cat"
                style={{ ['--cat' as string]: cat.color } as CSSProperties}
              >
                <CategoryIcon name={cat.icon} size={19} />
              </span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="og-card list-card" aria-label="最近记录">
        <div className="og-card-head is-plain">
          <div className="og-card-copy">
            <span className="og-eyebrow">最近</span>
            <h2>流水</h2>
          </div>
          <button className="og-link" onClick={onGoLedger} type="button">
            全部
          </button>
        </div>
        {recent.length > 0 ? (
          recent.map((tx) => (
            <TxRow
              key={tx.id}
              tx={tx}
              category={findCategory(state.categories, tx.categoryId)}
              showDate
              onClick={() => onOpenTx(tx)}
            />
          ))
        ) : (
          <Empty
            icon={ReceiptText}
            title="还没有记过账"
            hint="第一笔，从今天的一杯咖啡开始。"
            action={
              <button className="btn-ghost sm" onClick={onAdd} type="button">
                记下第一笔
              </button>
            }
          />
        )}
      </section>

      <p className="og-footnote">每一笔，都算数</p>
    </div>
  )
}
