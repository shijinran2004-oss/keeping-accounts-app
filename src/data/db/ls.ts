/**
 * localStorage 回退实现与旧数据读取。
 *
 * 只在 IndexedDB 不可用（隐私模式、被禁用）时启用。
 * 这个实现每次写入仍要重写整份状态，是「能跑」而不是「推荐」；
 * 快照只留在内存里，刷新即失，界面上会提示不支持自动快照。
 */
import type {
  Category,
  LedgerRepository,
  LedgerState,
  Settings,
  SnapshotMeta,
  SnapshotRecord,
  Tx,
} from '../../types'
import { LEGACY_KEY, STORAGE_KEY, freshState, normalize } from '../normalize'

/** 从 localStorage 读一份合法状态；没有数据或已损坏时返回 null */
export function readLegacyState(): LedgerState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    // 旧键读到后补一份新键，下次直接走新键
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, raw)
    return normalize(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * 迁移成功后把同一份数据回写旧键；之后每次账本变化都会同步刷新这份镜像，
 * 保证极端情况下回退到 localStorage 时读到的是最新账本（主数据仍在 IndexedDB）。
 */
export function writeLegacyMirror(state: LedgerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* 配额不足就放弃镜像，主数据在 IndexedDB 里 */
  }
}

export class LsRepository implements LedgerRepository {
  readonly engine = 'ls' as const

  private cache: LedgerState | null = null
  /** 回退模式没有独立快照存储，只保留本次会话内的快照 */
  private readonly snapshots = new Map<string, SnapshotRecord>()

  async load(): Promise<LedgerState | null> {
    this.cache = readLegacyState()
    return this.cache
  }

  async replaceAll(state: LedgerState): Promise<void> {
    this.save(state)
  }

  async putTx(tx: Tx): Promise<void> {
    const state = this.current()
    const exists = state.txs.some((row) => row.id === tx.id)
    const txs = exists ? state.txs.map((row) => (row.id === tx.id ? tx : row)) : [tx, ...state.txs]
    this.save({ ...state, txs })
  }

  async deleteTx(id: string): Promise<void> {
    const state = this.current()
    this.save({ ...state, txs: state.txs.filter((row) => row.id !== id) })
  }

  async putSettings(settings: Settings): Promise<void> {
    this.save({ ...this.current(), settings })
  }

  async putCategories(categories: Category[]): Promise<void> {
    this.save({ ...this.current(), categories })
  }

  async putSnapshot(snapshot: SnapshotRecord): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot)
  }

  async listSnapshots(): Promise<SnapshotMeta[]> {
    return [...this.snapshots.values()]
      .map(({ id, kind, createdAt, txCount, bytes }) => ({ id, kind, createdAt, txCount, bytes }))
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  async getSnapshot(id: string): Promise<SnapshotRecord | null> {
    return this.snapshots.get(id) ?? null
  }

  async deleteSnapshot(id: string): Promise<void> {
    this.snapshots.delete(id)
  }

  close(): void {
    this.cache = null
  }

  private current(): LedgerState {
    return this.cache ?? freshState()
  }

  /** 整份写回；配额超限时把原始 DOMException 抛给上层提示 */
  private save(next: LedgerState): void {
    this.cache = next
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}
