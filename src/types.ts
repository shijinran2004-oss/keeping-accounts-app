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
}

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
  /** 导入 JSON 备份，返回是否成功及原因 */
  importState: (json: string) => { ok: boolean; error?: string }
  clearTxs: () => void
  resetAll: () => void
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

/** 轻提示样式 */
export type ToastTone = 'default' | 'success' | 'error'

/** 轻提示消息 */
export interface ToastItem {
  id: number
  text: string
  tone: ToastTone
}
