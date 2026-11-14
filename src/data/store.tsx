import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Category, LedgerApi, LedgerState, NewCategory, Settings, Tx, TxDraft } from '../types'
import { isAccentKey, isThemeMode } from '../utils/theme'
import { DEFAULT_CATEGORIES } from './categories'

export const DEFAULT_LEDGER_NAME = '使劲燃的钱'

const STORAGE_KEY = 'shijinran.money.v1'
/** 旧版本（小满账本）用过的键，读取时做一次性迁移 */
const LEGACY_KEY = 'xiaoman.ledger.v1'

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function freshState(): LedgerState {
  return {
    version: 1,
    txs: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    settings: { salary: 0, fixedCost: 0, onboarded: false, name: DEFAULT_LEDGER_NAME, payday: 15, salaryLag: 1, paydaySet: false },
  }
}

function normalize(raw: unknown): LedgerState | null {
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
    .map((t) => ({ ...t, note: t.note ?? '', createdAt: t.createdAt ?? 0 }))
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
      theme: isThemeMode(s.theme) ? s.theme : 'dark',
      accent: isAccentKey(s.accent) ? s.accent : 'lime',
      payday: s.paydaySet === true ? Math.min(31, Math.max(1, Math.round(Number(s.payday) || 15))) : 15,
      salaryLag: s.paydaySet === true && s.salaryLag === 1 ? 1 : 0,
      paydaySet: s.paydaySet === true,
    },
  }
}

function load(): LedgerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return freshState()
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, raw)
    return normalize(JSON.parse(raw)) ?? freshState()
  } catch {
    return freshState()
  }
}

const LedgerContext = createContext<LedgerApi | null>(null)

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LedgerState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage full or unavailable */
    }
  }, [state])

  const addTx = useCallback((draft: TxDraft) => {
    const tx: Tx = { ...draft, id: uid(), createdAt: Date.now() }
    setState((s) => ({ ...s, txs: [tx, ...s.txs] }))
    return tx
  }, [])

  const updateTx = useCallback((id: string, draft: TxDraft) => {
    setState((s) => ({
      ...s,
      txs: s.txs.map((t) => (t.id === id ? { ...t, ...draft, createdAt: Date.now() } : t)),
    }))
  }, [])

  const deleteTx = useCallback((id: string) => {
    setState((s) => ({ ...s, txs: s.txs.filter((t) => t.id !== id) }))
  }, [])

  const saveSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  }, [])

  const addCategory = useCallback((cat: NewCategory) => {
    const next: Category = { ...cat, id: `custom-${uid()}`, builtin: false }
    setState((s) => ({ ...s, categories: [...s.categories, next] }))
  }, [])

  const deleteCategory = useCallback((id: string) => {
    setState((s) => {
      const target = s.categories.find((c) => c.id === id)
      if (!target || target.builtin) return s
      const fallback = s.categories.find((c) => c.id === (target.type === 'income' ? 'other-income' : 'other'))
      return {
        ...s,
        categories: s.categories.filter((c) => c.id !== id),
        txs: s.txs.map((t) => (t.categoryId === id ? { ...t, categoryId: fallback?.id ?? 'other' } : t)),
      }
    })
  }, [])

  const importState = useCallback((json: string) => {
    try {
      const parsed = normalize(JSON.parse(json))
      if (!parsed) return { ok: false, error: '备份内容不完整' }
      setState(parsed)
      return { ok: true }
    } catch {
      return { ok: false, error: '不是有效的 JSON 备份' }
    }
  }, [])

  const clearTxs = useCallback(() => {
    setState((s) => ({ ...s, txs: [] }))
  }, [])

  const resetAll = useCallback(
() => {
    setState(freshState())
  }, [])

  const value = useMemo<LedgerApi>(
    () => ({
      state,
      addTx,
      updateTx,
      deleteTx,
      saveSettings,
      addCategory,
      deleteCategory,
      importState,
      clearTxs,
      resetAll,
    }),
    [state, addTx, updateTx, deleteTx, saveSettings, addCategory, deleteCategory, importState, clearTxs, resetAll],
  )

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerApi {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider')
  return ctx
}
