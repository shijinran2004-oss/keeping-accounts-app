/**
 * 数据层唯一入口。
 * 页面只从这里取数据能力，不直接引用 store 内部实现，方便以后换成 SQLite / 云同步。
 */
export { LedgerProvider, useLedger, freshState } from './store'
export {
  DEFAULT_CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  ICON_CHOICES,
  COLOR_CHOICES,
  findCategory,
} from './categories'
