/**
 * 账本状态的校验与兜底。
 *
 * 负责三件事：
 * 1. freshState / DEFAULT_LEDGER_NAME：新装时的初始状态与默认账本名；
 * 2. normalize：把 localStorage、备份文件、IndexedDB 读出来的未知数据收成一份合法 LedgerState；
 * 3. 存储键名常量，供 data/db 读取旧数据。
 *
 * 不负责：持久化本身（见 data/db）与统计口径（见 lib/stats）。
 */
import type { Category, LedgerState, Settings, Tx } from '../types'
import { isAccentKey, isThemeMode } from '../lib'
import { DEFAULT_CATEGORIES } from './categories'

export const DEFAULT_LEDGER_NAME = '使劲燃的钱'

/** 当前主存储键；旧版本（小满账本）用过的键只读迁移 */
export const STORAGE_KEY = 'shijinran.money.v1'
export const LEGACY_KEY = 'xiaoman.ledger.v1'

/** 生成记录与自定义分类的 id，优先用 crypto.randomUUID */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

/** 新装时的空账本 */
export function freshState(): LedgerState {
  return {
    version: 1,
    txs: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    settings: { salary: 0, fixedCost: 0, onboarded: false, name: DEFAULT_LEDGER_NAME, payday: 15, salaryLag: 1, paydaySet: false },
  }
}

/** 单月到账日覆盖表：只保留 YYYY-MM → 1–31 的合法项 */
function sanitizeOverrides(input: unknown): Record<string, number> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const day = Math.round(Number(value))
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) continue
    if (!Number.isFinite(day) || day < 1 || day > 31) continue
    out[key] = day
  }
  return Object.keys(out).length ? out : undefined
}

/** 商户记忆：只留「商户名 → 分类 id」这种字符串对，空值丢掉 */
function sanitizeMerchantRules(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const merchant = key.trim().slice(0, 24)
    if (!merchant || typeof value !== 'string' || !value) continue
    out[merchant] = value
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * 把未知来源的数据收成合法 LedgerState。
 * 数据缺胳膊少腿时返回 null，由调用方决定用空账本还是报错。
 */
export function normalize(raw: unknown): LedgerState | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Partial<LedgerState>
  if (!Array.isArray(data.txs) || !Array.isArray(data.categories) || !data.settings) return null
  const savedCats: Category[] = data.categories.filter(
    (c): c is Category =>
      !!c && typeof c.id === 'string' && typeof c.name === 'string' && (c.type === 'expense' || c.type === 'income'),
  )
  const merged: Category[] = DEFAULT_CATEGORIES.map((base) => {
    const saved = savedCats.find((c) => c.id === base.id)
    return saved ? { ...base, ...saved, builtin: true } : { ...base }
  })
  savedCats.filter((c) => !c.builtin && !merged.some((m) => m.id === c.id)).forEach((c) => merged.push(c))
  const txs: Tx[] = data.txs
    .filter(
      (t): t is Tx =>
        !!t &&
        typeof t.id === 'string' &&
        (t.type === 'expense' || t.type === 'income') &&
        Number.isFinite(t.amount) &&
        typeof t.date === 'string' &&
        typeof t.categoryId === 'string',
    )
    .map((t) => ({
      ...t,
      note: t.note ?? '',
      createdAt: t.createdAt ?? 0,
      orderId: typeof t.orderId === 'string' && t.orderId ? t.orderId : undefined,
    }))
  const s = data.settings as Partial<Settings>
  return {
    version: 1,
    txs,
    categories: merged,
    settings: {
      salary: Math.max(0, Math.round(Number(s.salary) || 0)),
      fixedCost: Math.max(0, Math.round(Number(s.fixedCost) || 0)),
      onboarded: !!s.onboarded,
      name: typeof s.name === 'string' ? s.name.trim().slice(0, 20) : DEFAULT_LEDGER_NAME,
      avatar: typeof s.avatar === 'string' && /^data:image\//.test(s.avatar) ? s.avatar : undefined,
      themeSet: s.themeSet === true,
      theme: s.themeSet === true && isThemeMode(s.theme) ? s.theme : 'light',
      accent: isAccentKey(s.accent) ? s.accent : 'lime',
      payday: s.paydaySet === true ? Math.min(31, Math.max(1, Math.round(Number(s.payday) || 15))) : 15,
      salaryLag: s.paydaySet === true && s.salaryLag === 1 ? 1 : 0,
      paydaySet: s.paydaySet === true,
      paydayOverrides: sanitizeOverrides(s.paydayOverrides),
      merchantRules: sanitizeMerchantRules(s.merchantRules),
    },
  }
}
