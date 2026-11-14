import { useEffect, useRef, useState } from 'react'
import {
  CalendarClock,
  Camera,
  ChevronRight,
  Clipboard,
  Download,
  FileJson,
  FolderOpen,
  Info,
  MonitorSmartphone,
  Moon,
  Palette,
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sun,
  Tags,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react'
import { DEFAULT_LEDGER_NAME, useLedger } from '../data'
import { COLOR_CHOICES, ICON_CHOICES } from '../data'
import {
  ACCENTS,
  THEME_OPTIONS,
  accentName,
  backupBytes,
  backupFileName,
  backupJson,
  centsToYuanInput,
  cycleRange,
  daysBetween,
  fileToAvatar,
  exportBackupFile,
  formatBytes,
  formatMoney,
  formatMonth,
  parseYuan,
  readBackupFile,
  salaryMonthLabel,
  themeName,
  todayStr,
} from '../utils'
import { formatDay } from '../utils'
import type { Category, TxType } from '../types'
import type { CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Clipboard as CapClipboard } from '@capacitor/clipboard'
import { CategoryIcon, Seal, SectionTitle, Sheet, useToast } from '../components'
import appIcon from '../assets/app-icon.png'

export function Me() {
  const { state, saveSettings, clearTxs, resetAll } = useLedger()
  const toast = useToast()
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)

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
        </div>
      </section>

      <footer className="me-foot">
        <img className="me-brand-icon" src={appIcon} alt="使劲燃的钱" />
        <div>
          <b>使劲燃的钱 v1.1.18</b>
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

function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveSettings } = useLedger()
  const toast = useToast()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (open) setDraft(state.settings.name?.trim() || DEFAULT_LEDGER_NAME)
  }, [open, state.settings.name])

  const save = () => {
    const next = draft.trim() || DEFAULT_LEDGER_NAME
    saveSettings({ name: next })
    toast('名字已更新')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="账本名字">
      <div className="sheet-body form">
        <label className="field">
          <span>名字</span>
          <input
            className="name-input"
            value={draft}
            maxLength={20}
            placeholder={DEFAULT_LEDGER_NAME}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
        </label>
        <p className="field-note">最多 20 个字；首页大标题会同步显示，问候语按手机时间自动变。</p>
        <button className="btn-primary" type="button" disabled={!draft.trim()} onClick={save}>
          保存
        </button>
      </div>
    </Sheet>
  )
}

function BudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveSettings } = useLedger()
  const toast = useToast()
  const [salary, setSalary] = useState('')
  const [fixed, setFixed] = useState('')

  useEffect(() => {
    if (!open) return
    setSalary(centsToYuanInput(state.settings.salary))
    setFixed(centsToYuanInput(state.settings.fixedCost))
  }, [open, state.settings.salary, state.settings.fixedCost])

  const clean = (v: string) => {
    const s = v.replace(/[^\d.]/g, '')
    const [a, ...rest] = s.split('.')
    return rest.length ? `${a}.${rest.join('').slice(0, 2)}` : a
  }

  return (
    <Sheet open={open} onClose={onClose} title="收入与预算">
      <div className="sheet-body form">
        <label className="field">
          <span>每月到手工资</span>
          <div className="money-input">
            <i>¥</i>
            <input
              value={salary}
              onChange={(e) => setSalary(clean(e.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="每月到手工资"
            />
          </div>
          <small>按实际到手金额填写，税后、扣完五险一金。</small>
        </label>
        <label className="field">
          <span>每月固定支出</span>
          <div className="money-input">
            <i>¥</i>
            <input
              value={fixed}
              onChange={(e) => setFixed(clean(e.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              aria-label="每月固定支出"
            />
          </div>
          <small>房租、房贷、订阅等。只在这里扣一次，不记进日常账目。</small>
        </label>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            saveSettings({ salary: parseYuan(salary), fixedCost: parseYuan(fixed) })
            toast('预算已更新', 'success')
            onClose()
          }}
        >
          保存
        </button>
      </div>
    </Sheet>
  )
}

function PaydaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveSettings } = useLedger()
  const toast = useToast()
  const [day, setDay] = useState('15')
  const [lag, setLag] = useState<0 | 1>(1)
  const [actual, setActual] = useState('15')
  const month = todayStr().slice(0, 7)

  useEffect(() => {
    if (!open) return
    const base = String(state.settings.payday ?? 15)
    setDay(base)
    setActual(String(state.settings.paydayOverrides?.[month] ?? base))
    setLag(state.settings.salaryLag === 1 ? 1 : 0)
  }, [open, month, state.settings.payday, state.settings.salaryLag, state.settings.paydayOverrides])

  const cleanDay = (v: string) => v.replace(/\D/g, '').slice(0, 2)
  const safeDay = Math.min(31, Math.max(1, Number(day) || 1))
  const safeActual = Math.min(31, Math.max(1, Number(actual) || safeDay))
  const cycle = cycleRange(todayStr(), safeDay, lag)
  const cycleDays = daysBetween(cycle.start, cycle.end) + 1

  return (
    <Sheet open={open} onClose={onClose} title="发薪日与工资归属">
      <div className="sheet-body form">
        <label className="field">
          <span>每月发薪日</span>
          <div className="money-input">
            <input
              value={day}
              onChange={(e) => {
                const next = cleanDay(e.target.value)
                if (actual === day) setActual(next)
                setDay(next)
              }}
              inputMode="numeric"
              placeholder="15"
              aria-label="每月发薪日"
            />
            <i className="is-suffix">号</i>
          </div>
          <small>1–31 号；29/30/31 遇到短月会自动按当月最后一天算。</small>
        </label>

        <label className="field">
          <span>{formatMonth(todayStr())}实际到账</span>
          <div className="money-input">
            <input
              value={actual}
              onChange={(e) => setActual(cleanDay(e.target.value))}
              inputMode="numeric"
              placeholder={String(safeDay)}
              aria-label="本月实际到账日"
            />
            <i className="is-suffix">号</i>
          </div>
          <small>
            只改这个月；下个月自动回到 {safeDay} 号。
            <button type="button" className="pay-reset" onClick={() => setActual(String(safeDay))}>
              恢复默认
            </button>
          </small>
        </label>

        <div className="field">
          <span>工资归属</span>
          <div className="segmented pay-lag" role="tablist" aria-label="工资归属">
            <button
              type="button"
              role="tab"
              aria-selected={lag === 0}
              className={lag === 0 ? 'is-active' : ''}
              onClick={() => setLag(0)}
            >
              当月发
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lag === 1}
              className={lag === 1 ? 'is-active' : ''}
              onClick={() => setLag(1)}
            >
              次月发上月
            </button>
          </div>
          <small>
            {lag === 1
              ? '例如 11 月 15 日到账的是 10 月工资；11 月整月都按 10 月工资做预算。'
              : '例如 11 月 15 日到账的是 11 月工资；11 月整月都按 11 月工资做预算。'}
          </small>
        </div>

        <div className="pay-preview">
          <span>按这个设置，预算月是</span>
          <b>{formatMonth(cycle.start)} · {salaryMonthLabel(cycle.salaryMonth)}</b>
          <em>
            共 {cycleDays} 天 · 本月 {safeActual} 号到账
          </em>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            const next = { ...(state.settings.paydayOverrides ?? {}) }
            if (safeActual === safeDay) delete next[month]
            else next[month] = safeActual
            saveSettings({
              payday: safeDay,
              salaryLag: lag,
              paydaySet: true,
              paydayOverrides: Object.keys(next).length ? next : undefined,
            })
            toast('发薪日已更新', 'success')
            onClose()
          }}
        >
          保存
        </button>
      </div>
    </Sheet>
  )
}

function CategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addCategory, deleteCategory } = useLedger()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<TxType>('expense')
  const [icon, setIcon] = useState<Category['icon']>('coffee')
  const [color, setColor] = useState(COLOR_CHOICES[0])

  useEffect(() => {
    if (!open) return
    setAdding(false)
    setName('')
    setType('expense')
    setIcon('coffee')
    setColor(COLOR_CHOICES[0])
  }, [open])

  const groups: { label: string; type: TxType }[] = [
    { label: '支出分类', type: 'expense' },
    { label: '收入分类', type: 'income' },
  ]

  return (
    <Sheet open={open} onClose={onClose} title="分类管理" full>
      <div className="sheet-body cat-manage">
        {groups.map((g) => (
          <div className="cat-manage-group" key={g.type}>
            <h3>{g.label}<span>{state.categories.filter((c) => c.type === g.type).length}</span></h3>
            <div className="card list-card">
              {state.categories
                .filter((c) => c.type === g.type)
                .map((c) => (
                  <div className="manage-row" key={c.id}>
                    <span className="cat-tile" style={{ ['--cat' as string]: c.color } as CSSProperties}>
                      <CategoryIcon name={c.icon} size={17} />
                    </span>
                    <span className="manage-name">{c.name}</span>
                    {c.builtin ? (
                      <span className="manage-tag">内置</span>
                    ) : (
                      <button
                        type="button"
                        className="manage-del"
                        aria-label={`删除${c.name}`}
                        onClick={() => {
                          deleteCategory(c.id)
                          toast('分类已删除，相关记录归入其他')
                        }}
                      >
                        <Trash2 size={16} strokeWidth={1.6} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}

        {adding ? (
          <div className="card add-cat-form">
            <h3>新建分类</h3>
            <label className="field compact">
              <span>名称</span>
              <input
                value={name}
                maxLength={6}
                onChange={(e) => setName(e.target.value)}
                placeholder="比如：咖啡"
                aria-label="分类名称"
              />
            </label>
            <div className="mini-seg" role="tablist" aria-label="分类类型">
              {(['expense', 'income'] as TxType[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={type === k}
                  className={type === k ? 'is-active' : ''}
                  onClick={() => setType(k)}
                >
                  {k === 'expense' ? '支出' : '收入'}
                </button>
              ))}
            </div>
            <div className="icon-picker">
              {ICON_CHOICES.map((ic) => (
                <button
                  key={ic.key}
                  type="button"
                  className={`icon-choice ${icon === ic.key ? 'is-active' : ''}`}
                  onClick={() => setIcon(ic.key)}
                  aria-label={ic.label}
                >
                  <CategoryIcon name={ic.key} size={18} />
                </button>
              ))}
            </div>
            <div className="color-picker">
              {COLOR_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-choice ${color === c ? 'is-active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`颜色 ${c}`}
                />
              ))}
            </div>
            <div className="form-actions">
              <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>取消</button>
              <button
                type="button"
                className="btn-primary"
                disabled={!name.trim()}
                onClick={() => {
                  addCategory({ name: name.trim(), type, icon, color })
                  toast('分类已添加', 'success')
                  setAdding(false)
                  setName('')
                }}
              >
                添加
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="add-cat-btn" onClick={() => setAdding(true)}>
            <Plus size={17} strokeWidth={2} /> 新建自定义分类
          </button>
        )}
      </div>
    </Sheet>
  )
}

function DataSheet({
  open,
  onClose,
  onClear,
}: {
  open: boolean
  onClose: () => void
  onClear: () => void
}) {
  const { state, importState } = useLedger()
  const toast = useToast()
  const [mode, setMode] = useState<'export' | 'import'>('export')
  const [text, setText] = useState('')
  const [pickedName, setPickedName] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setMode('export')
    setText('')
    setPickedName('')
    setConfirmClear(false)
    setBusy(false)
  }, [open])

  const json = backupJson(state)
  const fileName = backupFileName(todayStr())
  const bytes = backupBytes(json)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      toast('备份文本已复制', 'success')
    } catch {
      try {
        await CapClipboard.write({ string: json })
        toast('备份文本已复制', 'success')
      } catch {
        toast('复制失败，请长按选择文本', 'error')
      }
    }
  }

  const exportFile = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await exportBackupFile(json, fileName)
      toast(res === 'downloaded' ? '备份文件已下载' : '备份文件已生成', 'success')
    } catch {
      toast('导出失败，可以改用下面的文本备份', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const content = await readBackupFile(file)
      setText(content)
      setPickedName(file.name)
      toast(`已读取 ${file.name}`, 'success')
    } catch {
      toast('读取失败，换一个文件试试', 'error')
    }
  }

  const doImport = () => {
    const res = importState(text)
    if (res.ok) {
      toast('账本已恢复', 'success')
      onClose()
    } else {
      toast(res.error ?? '导入失败', 'error')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="数据备份" full>
      <div className="sheet-body data-sheet">
        <div className="mini-seg wide" role="tablist" aria-label="备份方式">
          <button type="button" role="tab" aria-selected={mode === 'export'} className={mode === 'export' ? 'is-active' : ''} onClick={() => setMode('export')}>
            <Download size={15} strokeWidth={1.7} /> 导出
          </button>
          <button type="button" role="tab" aria-selected={mode === 'import'} className={mode === 'import' ? 'is-active' : ''} onClick={() => setMode('import')}>
            <Upload size={15} strokeWidth={1.7} /> 导入
          </button>
        </div>

        {mode === 'export' ? (
          <>
            <div className="backup-card">
              <div className="backup-file">
                <FileJson size={20} strokeWidth={1.5} />
                <div>
                  <b>{fileName}</b>
                  <span>
                    {state.txs.length} 笔记录 · {state.categories.length} 个分类 · {formatBytes(bytes)}
                  </span>
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={exportFile} disabled={busy}>
                <Download size={16} strokeWidth={1.8} /> {busy ? '正在生成…' : '导出备份文件'}
              </button>
            </div>
            <p className="hint">
              导出后可以把文件发到微信、网盘或电脑上。换手机、重装 App 之后，切到「导入」选这个文件就能完整恢复。
            </p>
            <button type="button" className="btn-ghost block" onClick={copy}>
              <Clipboard size={15} strokeWidth={1.7} /> 复制为文本备份
            </button>
          </>
        ) : (
          <>
            <p className="hint">选择之前导出的 .json 文件；也可以把备份内容直接粘到下面的框里。导入会覆盖当前账本。</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="file-input"
              onChange={onFile}
            />
            <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
              <FolderOpen size={16} strokeWidth={1.8} /> 选择备份文件
            </button>
            {pickedName ? (
              <p className="backup-picked">
                <FileJson size={14} strokeWidth={1.7} /> {pickedName}
              </p>
            ) : null}
            <textarea
              className="backup-area"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setPickedName('')
              }}
              placeholder='把备份内容粘贴到这里，形如 {"version":1,...}'
              aria-label="粘贴备份内容"
            />
            <button type="button" className="btn-primary" disabled={!text.trim()} onClick={doImport}>
              导入并覆盖
            </button>
          </>
        )}

        <div className="data-note">
          <Info size={15} strokeWidth={1.7} />
          <p>数据保存在本机的应用存储里，卸载 App 会一起清除，记得偶尔导出一次备份。</p>
        </div>

        <div className="danger-zone">
          <h3>清空数据</h3>
          {confirmClear ? (
            <div className="confirm-row">
              <span>将删除全部 {state.txs.length} 笔记录，无法撤销。</span>
              <div>
                <button type="button" className="btn-ghost sm" onClick={() => setConfirmClear(false)}>取消</button>
                <button type="button" className="btn-danger sm" onClick={onClear}>确认清空</button>
              </div>
            </div>
          ) : (
            <button type="button" className="danger-row" onClick={() => setConfirmClear(true)}>
              <Trash2 size={16} strokeWidth={1.6} /> 清空所有记录
            </button>
          )}
        </div>
      </div>
    </Sheet>
  )
}
