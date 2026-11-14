import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  CalendarClock,
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
  themeName,
  todayStr,
  watchStatus,
} from '../lib'
import { Seal, SectionTitle, useToast } from '../ui'
import { BudgetSheet, CategorySheet, DataSheet, NameSheet, PaydaySheet } from '../sheets'
import type { WatchStatus } from '../types'
import appIcon from '../assets/app-icon.png'

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
    void watchStatus().then(setWatch)
  }, [canWatch])

  const toggleWatch = async () => {
    if (watchBusy) return
    setWatchBusy(true)
    try {
      const next = watch?.enabled ? await disableWatch() : await enableWatch()
      setWatch((prev) => ({
        supported: true,
        enabled: next.enabled,
        running: next.running,
        permission: next.permission ?? prev?.permission ?? 'prompt',
      }))
      toast(next.enabled ? '截图记账已开启，截屏后会自动认出金额' : '截图记账已关闭')
    } catch (error) {
      toast(error instanceof Error ? error.message : '没开启成功，看看是不是没给相册权限', 'error')
    } finally {
      setWatchBusy(false)
    }
  }

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
                  ? '已开启：截屏后自动认金额，点通知确认'
                  : '默认关闭；开启后下拉栏会常驻一条通知'
              }
              value={watchBusy ? '…' : watch?.enabled ? '已开启' : '已关闭'}
              onClick={toggleWatch}
            />
          )}
        </div>
        {canWatch && (
          <p className="field-note">截图只在这台手机上识别，识别出金额才提醒你确认，不会自己入账。</p>
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
