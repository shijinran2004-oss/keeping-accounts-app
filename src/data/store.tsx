import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Category,
  ImportMode,
  ImportOutcome,
  LedgerApi,
  LedgerRepository,
  LedgerState,
  NewCategory,
  ParsedBackup,
  Settings,
  SnapshotMeta,
  Tx,
  TxDraft,
} from '../types'
import { freshState, normalize, uid } from './normalize'
import { openLedger, writeLegacyMirror } from './db'
import {
  applyImport,
  createSnapshot,
  maybeWeeklySnapshot,
  restoreSnapshot as restoreSnapshotFrom,
} from './backup'

export { DEFAULT_LEDGER_NAME, freshState } from './normalize'

const LedgerContext = createContext<LedgerApi | null>(null)

/** 启动阶段：正在打开数据库，或者彻底打不开 */
type Boot = { status: 'loading' } | { status: 'failed'; message: string }

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LedgerState | null>(null)
  const [boot, setBoot] = useState<Boot>({ status: 'loading' })
  const [storageError, setStorageError] = useState<string | null>(null)
  const repoRef = useRef<LedgerRepository | null>(null)
  const stateRef = useRef<LedgerState | null>(null)
  stateRef.current = state

  // 打开账本：优先 IndexedDB，必要时把旧 localStorage 搬过来；失败才显示错误页
  useEffect(() => {
    let alive = true
    openLedger()
      .then((opened) => {
        if (!alive) return
        repoRef.current = opened.repo
        stateRef.current = opened.state
        setState(opened.state)
        // 一周没备份就自动补一份，失败只写日志
        void maybeWeeklySnapshot(opened.repo, opened.state)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setBoot({ status: 'failed', message: error instanceof Error ? error.message : '未知错误' })
      })
    return () => {
      alive = false
    }
  }, [])

  // 主数据在 IndexedDB；localStorage 留一份最新镜像，回退到旧存储时不至于读到旧账
  useEffect(() => {
    if (state && repoRef.current?.engine === 'idb') writeLegacyMirror(state)
  }, [state])

  /** 所有落盘都走这里：界面先更新，写入失败只提示、不打断记账 */
  const persist = useCallback((work: (repo: LedgerRepository) => Promise<unknown>) => {
    const repo = repoRef.current
    if (!repo) return
    work(repo).catch((error: unknown) => {
      console.error('[ledger] 写入失败', error)
      setStorageError(error instanceof Error ? error.message : '写入本地数据库失败')
    })
  }, [])

  const addTx = useCallback(
    (draft: TxDraft) => {
      const tx: Tx = { ...draft, id: uid(), createdAt: Date.now() }
      setState((s) => (s ? { ...s, txs: [tx, ...s.txs] } : s))
      persist((repo) => repo.putTx(tx))
      return tx
    },
    [persist],
  )

  const updateTx = useCallback(
    (id: string, draft: TxDraft) => {
      const current = stateRef.current
      const before = current?.txs.find((t) => t.id === id)
      if (!current || !before) return
      const next: Tx = { ...before, ...draft, createdAt: Date.now() }
      setState({ ...current, txs: current.txs.map((t) => (t.id === id ? next : t)) })
      persist((repo) => repo.putTx(next))
    },
    [persist],
  )

  const deleteTx = useCallback(
    (id: string) => {
      const current = stateRef.current
      if (!current) return
      setState({ ...current, txs: current.txs.filter((t) => t.id !== id) })
      persist((repo) => repo.deleteTx(id))
    },
    [persist],
  )

  const saveSettings = useCallback(
    (patch: Partial<Settings>) => {
      const current = stateRef.current
      if (!current) return
      const settings = { ...current.settings, ...patch }
      setState({ ...current, settings })
      persist((repo) => repo.putSettings(settings))
    },
    [persist],
  )

  const addCategory = useCallback(
    (cat: NewCategory) => {
      const current = stateRef.current
      if (!current) return
      const next: Category = { ...cat, id: `custom-${uid()}`, builtin: false }
      const categories = [...current.categories, next]
      setState({ ...current, categories })
      persist((repo) => repo.putCategories(categories))
    },
    [persist],
  )

  const updateCategoryIcon = useCallback(
    (id: string, icon: Category['icon']) => {
      const current = stateRef.current
      if (!current) return
      const categories = current.categories.map((c) => (c.id === id ? { ...c, icon } : c))
      setState({ ...current, categories })
      persist((repo) => repo.putCategories(categories))
    },
    [persist],
  )

  const deleteCategory = useCallback(
    (id: string) => {
      const current = stateRef.current
      if (!current) return
      const target = current.categories.find((c) => c.id === id)
      if (!target || target.builtin) return
      const fallback = current.categories.find(
        (c) => c.id === (target.type === 'income' ? 'other-income' : 'other'),
      )
      const fallbackId = fallback?.id ?? 'other'
      const touched: Tx[] = []
      const txs = current.txs.map((t) => {
        if (t.categoryId !== id) return t
        const next = { ...t, categoryId: fallbackId }
        touched.push(next)
        return next
      })
      const categories = current.categories.filter((c) => c.id !== id)
      setState({ ...current, categories, txs })
      persist(async (repo) => {
        await repo.putCategories(categories)
        await Promise.all(touched.map((tx) => repo.putTx(tx)))
      })
    },
    [persist],
  )

  const importState = useCallback(
    (json: string) => {
      let parsed: LedgerState | null = null
      try {
        parsed = normalize(JSON.parse(json))
      } catch {
        return { ok: false, error: '不是有效的 JSON 备份' }
      }
      if (!parsed) return { ok: false, error: '备份内容不完整' }
      const next = parsed
      setState(next)
      persist((repo) => repo.replaceAll(next))
      return { ok: true }
    },
    [persist],
  )

  const clearTxs = useCallback(() => {
    const current = stateRef.current
    if (!current) return
    const next = { ...current, txs: [] }
    setState(next)
    persist(async (repo) => {
      await createSnapshot(repo, current, 'before-clear')
      await repo.replaceAll(next)
    })
  }, [persist])

  const importBackup = useCallback(
    async (backup: ParsedBackup, mode: ImportMode): Promise<ImportOutcome> => {
      const repo = repoRef.current
      const current = stateRef.current
      if (!repo || !current) throw new Error('账本还没打开')
      // 先留底再动数据：快照失败就放弃导入，避免无路可退
      await createSnapshot(repo, current, 'before-import')
      const { state: next, outcome } = applyImport(backup, current, mode)
      await repo.replaceAll(next)
      stateRef.current = next
      setState(next)
      return outcome
    },
    [],
  )

  const listSnapshots = useCallback(async (): Promise<SnapshotMeta[]> => {
    const repo = repoRef.current
    return repo ? repo.listSnapshots() : []
  }, [])

  const restoreSnapshot = useCallback(async (id: string) => {
    const repo = repoRef.current
    if (!repo) return { ok: false, error: '账本还没打开' }
    try {
      const next = await restoreSnapshotFrom(repo, id)
      stateRef.current = next
      setState(next)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '恢复失败' }
    }
  }, [])

  const resetAll = useCallback(() => {
    const next = freshState()
    setState(next)
    persist((repo) => repo.replaceAll(next))
  }, [persist])

  const dismissStorageError = useCallback(() => setStorageError(null), [])

  const value = useMemo<LedgerApi | null>(() => {
    if (!state) return null
    return {
      state,
      addTx,
      updateTx,
      deleteTx,
      saveSettings,
      addCategory,
      deleteCategory,
      updateCategoryIcon,
      importState,
      clearTxs,
      resetAll,
      importBackup,
      listSnapshots,
      restoreSnapshot,
      storageError,
      dismissStorageError,
    }
  }, [
    state,
    addTx,
    updateTx,
    deleteTx,
    saveSettings,
    addCategory,
    deleteCategory,
    updateCategoryIcon,
    importState,
    clearTxs,
    resetAll,
    importBackup,
    listSnapshots,
    restoreSnapshot,
    storageError,
    dismissStorageError,
  ])

  if (!value) return <BootScreen boot={boot} />

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

/** 打开账本时的过渡页：正常情况一闪而过，打不开时给出明确原因 */
function BootScreen({ boot }: { boot: Boot }) {
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 32,
        textAlign: 'center',
        background: dark ? '#000000' : '#F2F2F7',
        color: dark ? '#8E8E93' : '#6B6B70',
        fontSize: 14,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1, color: dark ? '#FFFFFF' : '#111114' }}>
        使劲燃的钱
      </div>
      {boot.status === 'failed' ? (
        <>
          <div>账本打不开</div>
          <div style={{ fontSize: 12, opacity: 0.75, maxWidth: 280, wordBreak: 'break-word' }}>{boot.message}</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: '10px 22px',
              border: 0,
              borderRadius: 999,
              background: dark ? '#FFFFFF' : '#111114',
              color: dark ? '#000000' : '#FFFFFF',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            重试
          </button>
        </>
      ) : (
        <div>正在打开账本…</div>
      )}
    </div>
  )
}

export function useLedger(): LedgerApi {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used inside LedgerProvider')
  return ctx
}
