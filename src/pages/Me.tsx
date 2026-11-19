import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  BellRing,
  CalendarClock,
  BatteryWarning,
  Camera,
  ChevronRight,
  Download,
  Layers,
  MonitorSmartphone,
  Moon,
  Palette,
  Pencil,
  ReceiptText,
  ShieldCheck,
  Sun,
  Tags,
  Wallet,
  Zap,
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
  requestAllFiles,
  requestIgnoreBattery,
  requestNotificationAccess,
  requestOverlay,
  setCaptureMode,
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
    // 从系统设置页回来要重新读一遍：横幅、悬浮窗权限都是在那里改的。
    // WebView 里应用切回来不一定派发 focus，visibilitychange 一定会，所以两个都听。
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    sync()
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', onVisible)
    }
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
        overlay: fresh.overlay ?? prev?.overlay,
        allFiles: fresh.allFiles ?? prev?.allFiles,
        mode: fresh.mode ?? prev?.mode,
        notifyAccess: fresh.notifyAccess ?? prev?.notifyAccess,
      }))
      if (next.enabled) {
        if (fresh.overlay === 'granted') {
          toast('截图记账已开启，截屏后从顶部弹出卡片，点「确认记录」直接记一笔')
        } else {
          const issue = noticeIssue(fresh.notice)
          toast(
            issue
              ? `截图记账已开启，但${issue.label}没打开，截屏后不会从顶部弹出`
              : '截图记账已开启，截屏后弹出通知，点「直接记一笔」就行',
            issue ? 'error' : undefined,
          )
        }
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

  const openOverlay = async () => {
    try {
      await requestOverlay()
      toast('在系统设置里允许「显示在其他应用上层」，回来截屏就会从顶部弹出卡片')
    } catch (error) {
      toast(error instanceof Error ? error.message : '没打开设置，可以手动到系统设置里允许', 'error')
    }
  }

  const openAllFiles = async () => {
    try {
      await requestAllFiles()
      toast('在系统设置里允许「所有文件访问」，回来截屏就会秒弹卡；不想给也没关系')
    } catch (error) {
      toast(error instanceof Error ? error.message : '没打开设置，可以手动到系统设置里允许', 'error')
    }
  }

  /** 弹卡确认 ↔ 静默记账：静默时认出金额就直接记，通知栏留一条可撤销的提醒 */
  const toggleMode = async () => {
    if (watchBusy) return
    setWatchBusy(true)
    try {
      const next = watch?.mode === 'silent' ? 'confirm' : 'silent'
      await setCaptureMode(next)
      const fresh = await watchStatus()
      setWatch((prev) => ({
        supported: prev?.supported ?? true,
        enabled: prev?.enabled ?? fresh.enabled,
        running: prev?.running ?? fresh.running,
        permission: prev?.permission ?? fresh.permission ?? 'prompt',
        notice: fresh.notice ?? prev?.notice,
        battery: fresh.battery ?? prev?.battery,
        lastCheckAt: fresh.lastCheckAt ?? prev?.lastCheckAt,
        overlay: fresh.overlay ?? prev?.overlay,
        allFiles: fresh.allFiles ?? prev?.allFiles,
        mode: fresh.mode ?? next,
        notifyAccess: fresh.notifyAccess ?? prev?.notifyAccess,
      }))
      toast(
        next === 'silent'
          ? '已切到静默记账：认出金额就自己记下，通知栏 10 分钟内可以撤销'
          : '已切回弹卡确认：截屏后点「确认记录」才记账',
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : '没切换成功，稍后再试', 'error')
    } finally {
      setWatchBusy(false)
    }
  }

  const openNotifyAccess = async () => {
    try {
      await requestNotificationAccess()
      toast('在系统设置里允许「通知使用权」，微信、支付宝、银行的付款通知就会自动记账')
    } catch (error) {
      toast(error instanceof Error ? error.message : '没打开设置，可以手动到系统设置里允许', 'error')
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
  // 没有悬浮窗权限时，截屏提醒就只能待在下拉通知栏，弹不弹全看厂商
  const overlayMissing = watch?.enabled && watch.overlay !== 'granted'
  // 「所有文件访问」是可选的加速项：不给也能用，只是要等系统媒体库索引 3-4 秒
  const allFilesMissing = watch?.enabled && watch.allFiles !== 'granted'
  // 静默记账：认出金额就直接记，不弹卡；靠「通知使用权」读微信/支付宝/银行的付款通知
  const silentMode = watch?.enabled && watch.mode === 'silent'
  const notifyMissing = silentMode && watch?.notifyAccess !== 'granted'
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
                  ? watch.overlay === 'granted'
                    ? '已开启：截屏后从顶部弹出卡片，点「确认记录」直接入账'
                    : '已开启：截屏后弹出通知，点「直接记一笔」马上入账'
                  : '默认关闭；开启后下拉栏会常驻一条通知'
              }
              value={watchBusy ? '…' : watch?.enabled ? '已开启' : '已关闭'}
              onClick={toggleWatch}
            />
          )}
          {canWatch && watch?.enabled && (
            <Row
              icon={silentMode ? Zap : BellRing}
              label="记账方式"
              sub={
                silentMode
                  ? '静默：截屏或付款通知认出金额就直接记下，不弹卡；通知栏 10 分钟内能撤销'
                  : '弹卡确认：截屏后弹出卡片，点「确认记录」才记（默认）'
              }
              value={watchBusy ? '…' : silentMode ? '静默记账' : '弹卡确认'}
              onClick={toggleMode}
            />
          )}
          {canWatch && notifyMissing && (
            <Row
              icon={BellRing}
              label="通知自动记账"
              sub="允许「通知使用权」后，微信、支付宝、银行付完款不用截图也能自动记下来"
              value="去允许"
              onClick={openNotifyAccess}
            />
          )}
          {canWatch && overlayMissing && (
            <Row
              icon={Layers}
              label="顶部弹窗"
              sub="允许「显示在其他应用上层」，截屏后就像 QQ 一样从顶部滑出卡片"
              value="去允许"
              onClick={openOverlay}
            />
          )}
          {canWatch && allFilesMissing && (
            <Row
              icon={Zap}
              label="秒弹（可选）"
              sub="允许「所有文件访问」后，截完图约 1 秒就弹卡；不给也能用，只是要等系统媒体库 3-4 秒"
              value="去开启"
              onClick={openAllFiles}
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
          <p className="field-note">截图只在这台手机上识别；卡片或通知里点「确认记录」就记好了，不用切回 App，点「取消」就直接丢掉。</p>
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
