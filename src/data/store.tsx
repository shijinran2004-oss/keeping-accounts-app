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
import { autoRecordToTx } from './auto'
import {
  ackAutoRecords,
  ackUndos,
  drainAutoRecords as readAutoRecords,
  drainUndos,
  onAutoRecord,
  onCaptureUndo,
} from '../lib'
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

  /** 补账流程串行跑：两次确认几乎同时到达时排队写，避免各自拿旧状态互相覆盖 */
  const syncChain = useRef<Promise<unknown>>(Promise.resolve())

  /**
   * 通知里点「直接记一笔」时，App 可能根本没在前台；
   * 原生先按金额入队，等这里用和小票同一套规则补商户、分类、日期，再真正写进账本。
   *
   * 并发保护有三层：
   * 1) 所有补账串成一条链，同一时刻只有一轮在读原生、写库；
   * 2) 原生 seq 变成确定性 id，同一笔重复写只会覆盖自己，不会多记；
   * 3) 落库成功后才 ack 原生存档，写失败/进程被杀下一轮还能拿回来，不会漏记。
   */
  const applyAutoRecords = useCallback(
    (repo: LedgerRepository, fallback: LedgerState): Promise<LedgerState> => {
      const run = async (): Promise<LedgerState> => {
        const base = stateRef.current ?? fallback
        const items = await readAutoRecords()
        if (!items.length) return base
        const known = new Set(base.txs.map((tx) => tx.id))
        const added: Tx[] = []
        for (const item of items) {
          const tx = autoRecordToTx(item, base.categories)
          if (tx && !known.has(tx.id)) added.push(tx)
        }
        if (added.length) {
          try {
            await Promise.all(added.map((tx) => repo.putTx(tx)))
          } catch (error) {
            console.error('[ledger] 自动记账写入失败', error)
            return base
          }
        }
        await ackAutoRecords()
        if (!added.length) return base
        const latest = stateRef.current ?? base
        const inState = new Set(latest.txs.map((tx) => tx.id))
        const fresh = added.filter((tx) => !inState.has(tx.id)).reverse()
        if (!fresh.length) return latest
        const next = { ...latest, txs: [...fresh, ...latest.txs] }
        stateRef.current = next
        setState(next)
        return next
      }
      const next = syncChain.current.then(run, run)
      syncChain.current = next.catch(() => undefined)
      return next
    },
    [],
  )

  /**
   * 静默记账的通知上点了「撤销」：把已经写进账本的那条删掉。
   *
   * survive 的办法和自动记账一样：原生存着撤销记号，删库成功才 ack，
   * 进程中途被杀下一轮还会再删一次（按 id 删是幂等的）。
   */
  const applyUndos = useCallback(
    (repo: LedgerRepository, fallback: LedgerState): Promise<LedgerState> => {
      const run = async (): Promise<LedgerState> => {
        const base = stateRef.current ?? fallback
        const seqs = await drainUndos()
        if (!seqs.length) return base
        const ids = seqs.map((seq) => `auto-${seq}`)
        for (const id of ids) {
          try {
            await repo.deleteTx(id)
          } catch (error) {
            console.error('[ledger] 撤销记账失败', error)
            return base
          }
        }
        await ackUndos()
        const gone = new Set(ids)
        const next = { ...base, txs: base.txs.filter((tx) => !gone.has(tx.id)) }
        stateRef.current = next
        setState(next)
        return next
      }
      const next = syncChain.current.then(run, run)
      syncChain.current = next.catch(() => undefined)
      return next
    },
    [],
  )

  // 打开账本：优先 IndexedDB，必要时把旧 localStorage 搬过来；失败才显示错误页
  useEffect(() => {
    let alive = true
    openLedger()
      .then(async (opened) => {
        if (!alive) return
        repoRef.current = opened.repo
        stateRef.current = opened.state
        let initial = opened.state
        try {
          // 先把通知里已经确认过的记录补上，再渲染，避免首页先闪一下没有的账
          initial = await applyAutoRecords(opened.repo, opened.state)
          // 撤销过的静默记账也要在渲染前删掉，不然首页会闪一下又消失
          initial = await applyUndos(opened.repo, initial)
        } catch (error) {
          console.error('[ledger] 取自动记账记录失败', error)
        }
        if (!alive) return
        stateRef.current = initial
        setState(initial)
        // 一周没备份就自动补一份，失败只写日志
        void maybeWeeklySnapshot(opened.repo, initial)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setBoot({ status: 'failed', message: error instanceof Error ? error.message : '未知错误' })
      })
    return () => {
      alive = false
    }
  }, [applyAutoRecords, applyUndos])

  // 通知里点「直接记一笔」时 App 只是切到后台的话，回到前台立刻补上
  useEffect(() => {
    const sync = () => {
      const repo = repoRef.current
      const current = stateRef.current
      if (!repo || !current) return
      // 状态由 applyAutoRecords 自己更新（串行链保证是基于最新状态合并的）
      void applyAutoRecords(repo, current).catch((error: unknown) =>
        console.error('[ledger] 自动记账失败', error),
      )
      void applyUndos(repo, current).catch((error: unknown) =>
        console.error('[ledger] 撤销记账失败', error),
      )
    }
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)
    // 原生在后台点了「直接记一笔」：不切回 App 也把它写进账本
    let stop: (() => void) | null = null
    void onAutoRecord(sync).then((off) => {
      stop = off
    })
    let stopUndo: (() => void) | null = null
    void onCaptureUndo(sync).then((off) => {
      stopUndo = off
    })
    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
      stop?.()
      stopUndo?.()
    }
  }, [applyAutoRecords, applyUndos])

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
