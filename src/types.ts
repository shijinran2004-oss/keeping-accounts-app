/**
 * 使劲燃的钱 · 全局类型定义
 *
 * 约定：全项目的 interface / type 都写在这里，其它文件只负责 import。
 * 金额一律用「分」为单位的整数，避免浮点误差；日期一律是本地日期字符串 YYYY-MM-DD。
 */

/* ============================================================
 * 1. 领域模型
 * ========================================================== */

/** 收支类型 */
export type TxType = 'expense' | 'income'

/** 分类图标（映射在 components/Icon.tsx） */
export type IconKey =
  | 'utensils' | 'coffee' | 'bus' | 'car' | 'bag' | 'house'
  | 'gamepad' | 'music' | 'camera' | 'heart' | 'book' | 'gift'
  | 'plane' | 'paw' | 'phone' | 'dumbbell' | 'baby' | 'shapes'
  | 'sparkles' | 'briefcase' | 'trend' | 'receipt'

/** 账目分类 */
export interface Category {
  id: string
  name: string
  icon: IconKey
  /** 分类主色，用于图标底色与图表 */
  color: string
  type: TxType
  /** 内置分类不可删除，升级时会与默认值合并 */
  builtin?: boolean
}

/** 新建分类时由 UI 提供的字段（id / builtin 由数据层生成） */
export type NewCategory = Omit<Category, 'id' | 'builtin'>

/** 一笔账 */
export interface Tx {
  id: string
  type: TxType
  /** 金额，单位：分 */
  amount: number
  categoryId: string
  note: string
  /** 本地日期 YYYY-MM-DD */
  date: string
  /** 创建时间戳（毫秒），用于同日排序 */
  createdAt: number
}

/** 新增 / 编辑一笔账时提交的数据 */
export interface TxDraft {
  type: TxType
  amount: number
  categoryId: string
  note: string
  date: string
}

/** 账本设置 */
export interface Settings {
  /** 每月到手工资，单位：分 */
  salary: number
  /** 每月固定支出（房租、房贷、订阅），单位：分；不记进流水平 */
  fixedCost: number
  /** 是否完成首次引导 */
  onboarded: boolean
  /** 账本名字，首页与「我的」共用；空值时回落到「使劲燃的钱」 */
  name?: string
  /** 自定义头像，data:image/... 的 data URL；为空时显示默认小狗印章 */
  avatar?: string
  /** 外观：深色 / 浅色 / 跟随系统（参考 openGym 的主题系统） */
  theme?: ThemeMode
  /** 用户是否显式选过主题；false 表示用新的浅色默认 */
  themeSet?: boolean
  /** 强调色预设，默认青柠绿 */
  accent?: AccentKey
  /** 每月发薪日 1–31；29/30/31 在短月自动取最后一天 */
  payday?: number
  /** 工资归属：0 = 当月发，1 = 次月发上月 */
  salaryLag?: 0 | 1
  /** 是否由用户明确选过发薪日；旧数据缺这个字段时按 15 号 / 次月发上月 */
  paydaySet?: boolean
  /** 个别月份的实际到账日，key 为到账月 YYYY-MM，未记录的月份用 payday */
  paydayOverrides?: Record<string, number>
}

/** 一个预算月（自然月 1 号到月末），salaryMonth 是这笔工资归属的月份 */
export interface CycleRange {
  start: string
  end: string
  /** 这笔工资归属的月份，YYYY-MM-01 */
  salaryMonth: string
}

/** 深色 / 浅色 / 跟随系统 */
export type ThemeMode = 'dark' | 'light' | 'system'

/** 参考 openGym 的 8 个 Apple 系统强调色 */
export type AccentKey = 'lime' | 'sky' | 'orange' | 'violet' | 'pink' | 'red' | 'teal' | 'gold'

/** 本地持久化的完整账本状态 */
export interface LedgerState {
  version: 1
  txs: Tx[]
  categories: Category[]
  settings: Settings
}

/* ============================================================
 * 2. 数据层对外接口（唯一入口见 data/store.tsx）
 * ========================================================== */

/** useLedger() 暴露的全部能力 */
export interface LedgerApi {
  state: LedgerState
  addTx: (draft: TxDraft) => Tx
  updateTx: (id: string, draft: TxDraft) => void
  deleteTx: (id: string) => void
  saveSettings: (patch: Partial<Settings>) => void
  addCategory: (category: NewCategory) => void
  deleteCategory: (id: string) => void
  /** 只换图标，内置分类也允许改 */
  updateCategoryIcon: (id: string, icon: Category['icon']) => void
  /** 导入 JSON 备份，返回是否成功及原因 */
  importState: (json: string) => { ok: boolean; error?: string }
  clearTxs: () => void
  resetAll: () => void
  /** 最近一次写入本地数据库失败的原因；null 表示正常 */
  storageError?: string | null
  /** 用户看过提示后清掉错误 */
  dismissStorageError?: () => void
  /** 应用解析好的备份；导入前自动存快照 */
  importBackup: (backup: ParsedBackup, mode: ImportMode) => Promise<ImportOutcome>
  /** 本机快照列表（最多 5 条） */
  listSnapshots: () => Promise<SnapshotMeta[]>
  /** 恢复到指定快照；恢复前会再存一份当前状态 */
  restoreSnapshot: (id: string) => Promise<{ ok: boolean; error?: string }>
}

/* ============================================================
 * 3. 统计计算结果
 * ========================================================== */

/** 单个分类的汇总 */
export interface CategorySlice {
  category: Category
  amount: number
  count: number
  /** 占同类型总额的百分比 0–100 */
  pct: number
}

/** 月度资金口径：工资、固定支出、可支配、已花、剩余 */
export interface MoneyFlow {
  salary: number
  extraIncome: number
  income: number
  fixedCost: number
  available: number
  spent: number
  remaining: number
  /** 日常支出占可支配的百分比 */
  spentPct: number
  /** 固定支出占工资的百分比 */
  fixedPct: number
  remainingPct: number
  totalOutflow: number
  outflowPct: number
  saveRate: number
  daysLeft: number
  dailyAvailable: number
  daysElapsed: number
  dailyAverage: number
}

/* ============================================================
 * 4. 导航与页面状态
 * ========================================================== */

/** 底部四个 Tab */
export type Tab = 'home' | 'ledger' | 'stats' | 'me'

/** 明细页筛选 */
export type TransactionFilter = 'all' | TxType

/** 统计页时间范围 */
export type StatsRange = 'day' | 'week' | 'month'

/** 快捷记账入口带的预选值 */
export interface AmountSeed {
  type?: TxType
  categoryId?: string
}

/* ============================================================
 * 5. 通用组件契约
 * ========================================================== */

/** 柱状图的一根柱子 */
export interface BarDatum {
  key: string
  label: string
  /** 金额，单位：分 */
  value: number
  active?: boolean
}

/** 环形图的一段 */
export interface DonutSlice {
  label: string
  /** 金额，单位：分 */
  value: number
  color: string
}

/** 小狗印章的尺寸档位 */
export type SealSize = 'sm' | 'lg' | 'mini'

/** 页头 / 我的页 / 引导页 / 小票上的小狗印章 */
export interface SealProps {
  size?: SealSize
  /** 额外类名，用于局部微调（如小票里的发光版） */
  className?: string
}

/** 首页表头的狗屋守卫：按本月预算消耗切换姿态 */
export type DogMood = 'peaceful' | 'alert' | 'panic' | 'dance'

/** 手绘狗屋 + 屋顶小狗，纯内联 SVG */
export interface DoghouseProps {
  mood?: DogMood
  /** 额外类名，便于在页头做尺寸微调 */
  className?: string
  /** 点一下狗屋的彩蛋；不传则纯装饰 */
  onClick?: () => void
}

/** 明细页日历的两种显示方式：金额 / 圆点 */
export type CalendarMode = 'amount' | 'dot'

/** 日历里的一天（已按账本汇总） */
export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string
  /** 1–31，格子上的数字 */
  day: number
  /** 是否属于当前浏览的月份（前后补位的日期为 false） */
  inMonth: boolean
  /** 当日支出，单位：分 */
  expense: number
  /** 当日收入，单位：分 */
  income: number
  /** 当日记录条数 */
  count: number
  /** 这一天是不是发薪日（含本月实际到账覆盖） */
  isPayday?: boolean
  /** 从今天到下次发薪日的渐变等级：0 不填，1–4 对应 GitHub 色板的四档 */
  payLevel?: number
}

/** 明细页的月历卡片 */
export interface MonthCalendarProps {
  /** 当前浏览的账期起始日（旧调用也可传月份任意一天） */
  month: string
  /** 选中的日期 YYYY-MM-DD */
  selected: string
  /** 整月格子（从周一开始，长度是 7 的倍数） */
  cells: CalendarCell[]
  mode: CalendarMode
  /** 只显示选中日期所在的那一周 */
  weekOnly: boolean
  onChangeMonth: (delta: number) => void
  onSelect: (date: string) => void
  onToday: () => void
  onMode: (mode: CalendarMode) => void
  onToggleWeek: () => void
  /** 账期标题，默认 formatMonth(month) */
  title?: string
  /** 标题下的小字，例如 11/15–12/14 · 10 月工资 */
  caption?: string
}

/** 明细页顶部迷你趋势卡（横条） */
export interface SparkSummaryProps {
  label: string
  /** 本期支出，单位：分 */
  spent: number
  /** 本期收入，单位：分 */
  income: number
  /** 收入 − 支出，单位：分 */
  balance: number
  /** 日常支出占可支配的百分比 */
  spentPct: number
  /** 每日支出序列，单位：分 */
  points: number[]
  /** 相比上月同期的变化百分比；无上月数据时为 null */
  comparePct: number | null
}

/** 流水详情弹层 */
export interface TxDetailSheetProps {
  /** 当前查看的记录；null 表示关闭 */
  tx: Tx | null
  onClose: () => void
  /** 打开复用的记账框 */
  onEdit: (tx: Tx) => void
}

/** 记账成功小票上的数据 */
export interface ReceiptData {
  /** 金额，单位：分 */
  amount: number
  categoryName: string
  categoryIcon: IconKey
  /** 分类磁贴底色 */
  categoryColor: string
  note: string
  /** 形如 2026-11-10 18:30 */
  dateTime: string
  /** 连续记账天数 */
  streak: number
  /** 新增还是编辑 */
  mode: 'create' | 'edit'
  /** 个人头像（data URL），没设置时小票用小狗印章 */
  avatar?: string
}

/** 轻提示样式 */
export type ToastTone = 'default' | 'success' | 'error'

/** 轻提示消息 */
export interface ToastItem {
  id: number
  text: string
  tone: ToastTone
}

/* ============================================================
 * 6. 备份文件
 * ========================================================== */

/** 导出结果：原生端走系统分享面板，浏览器直接下载 */
export type BackupExportResult = 'shared' | 'downloaded'

/* ============================================================
 * 7. 存储层（IndexedDB 主存储 / localStorage 回退）
 * ========================================================== */

/** 当前使用的存储引擎 */
export type StorageEngine = 'idb' | 'ls'

/** 快照触发原因 */
export type SnapshotKind = 'before-import' | 'before-clear' | 'before-restore' | 'weekly' | 'manual'

/** 快照摘要：列表只读这个，不带正文 */
export interface SnapshotMeta {
  id: string
  kind: SnapshotKind
  /** 生成时间戳（毫秒） */
  createdAt: number
  /** 快照包含多少笔记录 */
  txCount: number
  /** UTF-8 字节数，用于显示体积 */
  bytes: number
}

/** 完整快照：data 是一份可以直接当备份用的 LedgerState JSON 文本 */
export interface SnapshotRecord extends SnapshotMeta {
  data: string
}

/**
 * 存储层统一接口。
 * 只有 data/store.tsx 依赖它；页面与弹层继续用 useLedger()。
 */
export interface LedgerRepository {
  readonly engine: StorageEngine
  /** 读出整份状态；空库返回 null */
  load(): Promise<LedgerState | null>
  /** 整份替换：导入、清空、重置 */
  replaceAll(state: LedgerState): Promise<void>
  /** 单笔新增或更新 */
  putTx(tx: Tx): Promise<void>
  deleteTx(id: string): Promise<void>
  putSettings(settings: Settings): Promise<void>
  putCategories(categories: Category[]): Promise<void>
  putSnapshot(snapshot: SnapshotRecord): Promise<void>
  listSnapshots(): Promise<SnapshotMeta[]>
  getSnapshot(id: string): Promise<SnapshotRecord | null>
  deleteSnapshot(id: string): Promise<void>
  close(): void
}

/** 启动结果：选中的引擎、初始状态、是否刚从旧存储迁移过来 */
export interface OpenedLedger {
  repo: LedgerRepository
  state: LedgerState
  engine: StorageEngine
  migrated: boolean
}
/* ============================================================
 * 8. 备份格式 v2 与导入
 * ========================================================== */

/** 导入方式：覆盖 / 合并 / 只恢复设置与分类 */
export type ImportMode = 'replace' | 'merge' | 'settings'

/** 备份文件的头部信息（不含账本正文） */
export interface BackupEnvelopeMeta {
  /** 1 = 旧版裸 JSON，2 = 带头部的容器 */
  schema: number
  appVersion?: string
  exportedAt?: number
  txCount: number
  categoryCount: number
  /** 文件是不是 gzip 压缩过 */
  compressed: boolean
}

/** 解析后的备份：正文已经过 normalize，可以直接用于导入 */
export interface ParsedBackup {
  state: LedgerState
  meta: BackupEnvelopeMeta
  warnings: string[]
}

/** 导入前给用户看的对比信息 */
export interface ImportPreview {
  mode: ImportMode
  txCount: number
  categoryCount: number
  dateFrom: string | null
  dateTo: string | null
  /** 合并模式：会新增 / 更新 / 完全相同的笔数 */
  toAdd: number
  toUpdate: number
  unchanged: number
  /** 覆盖模式：会被替换掉的现有记录数 */
  replaceCount: number
  warnings: string[]
}

/** 导入结果 */
export interface ImportOutcome {
  mode: ImportMode
  added: number
  updated: number
  unchanged: number
  /** 导入后账本总记录数 */
  total: number
}

