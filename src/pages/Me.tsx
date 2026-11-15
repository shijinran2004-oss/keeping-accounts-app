import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  BellRing,
  CalendarClock,
  BatteryWarning,
  Camera,
  ChevronRight,
  Download,
  MonitorSmartphone,
  Moon,
  Palette,
  Pencil,
  ReceiptText,
  ShieldCheck,
  Sun,
  Tags,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { APP_VERSION, DEFAULT_LEDGER_NAME, useLedger } from '../data'
import {
  ACCENTS,
  THEME_OPTIONS,
  accentName,
  captureAvailable,
  disableWatch,
  enableWatch,
  fileToAvatar,
  formatDay,
  formatMoney,
  openNoticeSettings,
  requestIgnoreBattery,
  themeName,
  todayStr,
  watchStatus,
} from '../lib'
import { Seal, SectionTitle, useToast } from '../ui'
import { BudgetSheet, CategorySheet, DataSheet, NameSheet, PaydaySheet } from '../sheets'
import type { NoticeStatus, WatchStatus } from '../types'
import appIcon from '../assets/app-icon.png'

/** 通知横幅被系统挡住时，告诉用户该去开哪一项 */
function noticeIssue(notice?: NoticeStatus): { label: string; sub: string } | null {
  if (!notice) return null
  if (!notice.notifications) return { label: '通知权限', sub: '系统把 App 通知关了，截屏后收不到提醒' }
  if (notice.importance >= 0 && notice.importance < 4) {
    return { label: '顶部横幅', sub: '「截图记账提醒」没设成横幅，截屏后只会待在下拉通知栏里' }
  }
  if (notice.dnd) return { label: '勿扰模式', sub: '系统勿扰会挡掉横幅；下拉通知栏里仍能点「直接记一笔」' }
  return null
}

/**
 * 我的：头像、主题、收入预算、发薪日、分类、备份和重置。
 * 页面只负责打开对应弹层，具体保存在各 Sheet 内完成。
 */
export function Me() {
  const { state, saveSettings, clearTxs, resetAll } = useLedger()
  const toast = useToast()
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [canWatch] = useState(() => captureAvailable())
  const [watch, setWatch] = useState<WatchStatus | null>(null)
  const [watchBusy, setWatchBusy] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!canWatch) return
    const sync = () => {
      void watchStatus().then(setWatch)
    }
    sync()
    // 从系统设置页回来时重新读一遍，横幅开关改完能立刻反映
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [canWatch])

  const toggleWatch = async () => {
    if (watchBusy) return
    setWatchBusy(true)
    try {
      const next = watch?.enabled ? await disableWatch() : await enableWatch()
      const fresh = await watchStatus()
      setWatch((prev) => ({
        supported: true,
        enabled: next.enabled,
        running: next.running,
        permission: next.permission ?? prev?.permission ?? 'prompt',
        notice: fresh.notice ?? prev?.notice,
        battery: fresh.battery ?? prev?.battery,
        lastCheckAt: fresh.lastCheckAt ?? prev?.lastCheckAt,
      }))
      if (next.enabled) {
        const issue = noticeIssue(fresh.notice)
        toast(
          issue
            ? `截图记账已开启，但${issue.label}没打开，截屏后不会从顶部弹出`
            : '截图记账已开启，截屏后弹出通知，点「直接记一笔」就行',
          issue ? 'error' : undefined,
        )
      } else {
        toast('截图记账已关闭')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '没开启成功，看看是不是没给相册权限', 'error')
    } finally {
      setWatchBusy(false)
    }
  }

  const openNotice = async () => {
    try {
      await openNoticeSettings()
      toast('把「横幅」打开，截屏后就会像 QQ 一样从顶部弹出')
    } catch (error) {
      toast(error instanceof Error ? error.message : '没打开设置，可以手动去系统设置里打开横幅', 'error')
    }
  }

  const openBattery = async () => {
    try {
      await requestIgnoreBattery()
      toast('允许「不受限制」后，截屏提醒就不会被省电策略推迟')
    } catch (error) {
      toast(error instanceof Error ? error.message : '没打开设置，可以手动到系统设置里允许后台运行', 'error')
    }
  }

  const notice = watch?.enabled ? noticeIssue(watch.notice) : null
  const batteryLimited = watch?.enabled && watch.battery === false
  const days = new Set(state.txs.map((t) => t.date)).size
  const first = [...state.txs].sort((a, b) => a.date.localeCompare(b.date))[0]
  const theme = state.settings.theme ?? 'light'
  const accent = state.settings.accent ?? 'lime'
  const ledgerName = state.settings.name?.trim() || DEFAULT_LEDGER_NAME

  return (
    <div className="page me">
      <header className="page-head">
        <div>
          <h1>我的</h1>
          <p>把账本调成自己的样子</p>
        </div>
      </header>

      <section className="profile-card">
        <button
          type="button"
          className="avatar-btn"
          aria-label="从相册更换头像"
          onClick={() => avatarInput.current?.click()}
        >
          {state.settings.avatar ? (
            <img src={state.settings.avatar} alt="我的头像" />
          ) : (
            <Seal size="lg" />
          )}
          <span className="avatar-badge" aria-hidden="true">
            <Camera size={12} strokeWidth={2.2} />
          </span>
        </button>
        <input
          ref={avatarInput}
          type="file"
          accept="image/*"
          className="file-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file || avatarBusy) return
            setAvatarBusy(true)
            try {
              const avatar = await fileToAvatar(file)
              saveSettings({ avatar })
              toast('头像已更新')
            } catch {
              toast('这张图片读不了，换一张试试')
            } finally {
              setAvatarBusy(false)
            }
          }}
        />
        <div className="profile-main">
          <button
            className="profile-name"
            type="button"
            aria-label="修改账本名字"
            onClick={() => setNameOpen(true)}
          >
            <span>{ledgerName}</span>
            <Pencil size={13} strokeWidth={2} />
          </button>
          <p>每一笔，都算数</p>
        </div>
        <div className="profile-stats">
          <div><b>{state.txs.length}</b><span>笔记录</span></div>
          <div><b>{days}</b><span>个记账日</span></div>
        </div>
        {first && <p className="profile-since">从 {formatDay(first.date)} 记到现在</p>}
      </section>

      <section className="section">
        <SectionTitle>外观</SectionTitle>
        <div className="card theme-card">
          <div className="theme-head">
            <span className="theme-label"><Palette size={17} strokeWidth={1.7} /> 主题</span>
            <span className="theme-value">{themeName(theme)} · {accentName(accent)}</span>
          </div>
          <div className="theme-modes">
            {THEME_OPTIONS.map((option) => {
              const OptionIcon =
                option.key === 'light' ? Sun : option.key === 'system' ? MonitorSmartphone : Moon
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`theme-mode${theme === option.key ? ' is-on' : ''}`}
                  onClick={() => saveSettings({ theme: option.key, themeSet: true })}
                >
                  <OptionIcon size={14} strokeWidth={1.8} />
                  {option.name}
                </button>
              )
            })}
          </div>
          <div className="accent-head">
            <span>强调色</span>
            <span className="theme-value">{accentName(accent)}</span>
          </div>
          <div className="accent-grid">
            {ACCENTS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`accent-swatch${accent === item.key ? ' is-on' : ''}`}
                style={{ '--sw': item.hex } as CSSProperties}
                aria-label={`强调色：${item.name}`}
                aria-pressed={accent === item.key}
                onClick={() => saveSettings({ accent: item.key })}
              />
            ))}
          </div>
          <p className="field-note">主题与强调色参考 openGym：深/浅色、跟随系统，8 个 Apple 系统色。</p>
        </div>
      </section>

      <section className="section">
        <SectionTitle>收入与预算</SectionTitle>
        <div className="card settings-card">
          <Row
            icon={Wallet}
            label="每月到手工资"
            sub="用来计算可支配的钱"
            value={`¥${formatMoney(state.settings.salary)}`}
            onClick={() => setBudgetOpen(true)}
          />
          <Row
            icon={ReceiptText}
            label="每月固定支出"
            sub="房租、订阅等，不重复记账"
            value={`¥${formatMoney(state.settings.fixedCost)}`}
            onClick={() => setBudgetOpen(true)}
          />
          <Row
            icon={CalendarClock}
            label="发薪日与工资归属"
            sub={
              state.settings.paydayOverrides?.[todayStr().slice(0, 7)]
                ? `本月 ${state.settings.paydayOverrides[todayStr().slice(0, 7)]} 号到账 · ${(state.settings.salaryLag ?? 0) === 1 ? '次月发上月' : '当月发'}`
                : (state.settings.salaryLag ?? 0) === 1
                  ? '次月发上月，预算按自然月算'
                  : '当月发，预算按自然月算'
            }
            value={`${state.settings.payday ?? 15} 号`}
            onClick={() => setPayOpen(true)}
          />
        </div>
        <p className="field-note">预算按自然月算；发薪日只决定工资哪天到账。</p>
      </section>

      <section className="section">
        <SectionTitle>账本设置</SectionTitle>
        <div className="card settings-card">
          <Row
            icon={Tags}
            label="分类管理"
            sub={`${state.categories.length} 个分类`}
            onClick={() => setCategoryOpen(true)}
          />
          <Row
            icon={Download}
            label="数据备份"
            sub="导出、导入或清空本机数据"
            onClick={() => setDataOpen(true)}
          />
          {canWatch && (
            <Row
              icon={Camera}
              label="截图记账"
              sub={
                watch?.enabled
                  ? '已开启：截屏后弹出通知，点「直接记一笔」马上入账'
                  : '默认关闭；开启后下拉栏会常驻一条通知'
              }
              value={watchBusy ? '…' : watch?.enabled ? '已开启' : '已关闭'}
              onClick={toggleWatch}
            />
          )}
          {canWatch && notice && (
            <Row
              icon={BellRing}
              label={notice.label}
              sub={notice.sub}
              value="去打开"
              onClick={openNotice}
            />
          )}
          {batteryLimited && (
            <Row
              icon={BatteryWarning}
              label="后台限制"
              sub="系统省电会把截屏监听冻住，提醒要等你回到 App 才一起弹；允许后台运行就不会迟到"
              value="去允许"
              onClick={openBattery}
            />
          )}
        </div>
        {canWatch && (
          <p className="field-note">截图只在这台手机上识别；通知里点「直接记一笔」就记好了，不用切回 App，点「取消」就直接丢掉。</p>
        )}
      </section>

      <footer className="me-foot">
        <img className="me-brand-icon" src={appIcon} alt="使劲燃的钱" />
        <div>
          <b>{`使劲燃的钱 v${APP_VERSION}`}</b>
          <p><ShieldCheck size={13} strokeWidth={1.6} /> 数据只保存在这台手机上，不上传</p>
        </div>
        <button
          type="button"
          className="reset-link"
          onClick={() => {
            if (window.confirm('重置会清空所有记录、分类和设置，确定吗？')) {
              resetAll()
              toast('账本已重置')
            }
          }}
        >
          重置
        </button>
      </footer>

      <NameSheet open={nameOpen} onClose={() => setNameOpen(false)} />
      <BudgetSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} />
      <PaydaySheet open={payOpen} onClose={() => setPayOpen(false)} />
      <CategorySheet open={categoryOpen} onClose={() => setCategoryOpen(false)} />
      <DataSheet
        open={dataOpen}
        onClose={() => setDataOpen(false)}
        onClear={() => {
          clearTxs()
          toast('记录已清空')
          setDataOpen(false)
        }}
      />
    </div>
  )
}

/** 设置行：图标 + 标题/副标题 + 右侧值 + 箭头，整行可点。 */
function Row({
  icon: Icon,
  label,
  sub,
  value,
  onClick,
}: {
  icon: LucideIcon
  label: string
  sub?: string
  value?: string
  onClick?: () => void
}) {
  return (
    <button type="button" className="setting-row" onClick={onClick}>
      <span className="setting-icon"><Icon size={18} strokeWidth={1.6} /></span>
      <span className="setting-main">
        <b>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      {value && <span className="setting-value">{value}</span>}
      {onClick && <ChevronRight size={16} strokeWidth={1.6} className="setting-chev" />}
    </button>
  )
}
