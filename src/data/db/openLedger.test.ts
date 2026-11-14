import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenedLedger } from '../../types'

/** 最小 localStorage 替身，够 readLegacyState / writeLegacyMirror 用 */
class MemoryStorage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

const STORAGE_KEY = 'shijinran.money.v1'
let opened: OpenedLedger | null = null

function legacyJson(count: number): string {
  return JSON.stringify({
    version: 1,
    txs: Array.from({ length: count }, (_, i) => ({
      id: 'tx-' + i,
      type: 'expense',
      amount: 100 + i,
      categoryId: 'food',
      note: '',
      date: '2026-11-01',
      createdAt: i,
    })),
    categories: [],
    settings: { salary: 10000, onboarded: true },
  })
}

/** openLedger 内部有模块级单例，每个用例重新 import */
async function freshOpenLedger() {
  vi.resetModules()
  const mod = await import('./migrate')
  return mod.openLedger
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory
  globalThis.localStorage = new MemoryStorage() as unknown as Storage
  opened = null
})

afterEach(() => {
  opened?.repo.close()
  opened = null
})

describe('openLedger', () => {
  it('全新安装：用 IndexedDB 并落一份初始状态', async () => {
    const openLedger = await freshOpenLedger()
    opened = await openLedger()
    expect(opened.engine).toBe('idb')
    expect(opened.migrated).toBe(false)
    expect(opened.state.txs).toHaveLength(0)
    expect(opened.state.categories.length).toBeGreaterThan(0)
  })

  it('旧账本迁移：条数一致、旧键回写成镜像', async () => {
    localStorage.setItem(STORAGE_KEY, legacyJson(7))
    const openLedger = await freshOpenLedger()
    opened = await openLedger()
    expect(opened.engine).toBe('idb')
    expect(opened.migrated).toBe(true)
    expect(opened.state.txs).toHaveLength(7)
    const mirror = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(mirror.txs).toHaveLength(7)
  })

  it('迁移后再次打开：不重复迁移，数据仍在', async () => {
    localStorage.setItem(STORAGE_KEY, legacyJson(5))
    const first = await freshOpenLedger()
    const one = await first()
    one.repo.close()
    opened = one

    const second = await freshOpenLedger()
    const two = await second()
    expect(two.engine).toBe('idb')
    expect(two.migrated).toBe(false)
    expect(two.state.txs.map((tx) => tx.id).sort()).toEqual(['tx-0', 'tx-1', 'tx-2', 'tx-3', 'tx-4'])
    two.repo.close()
  })

  it('人工回退开关 ls：直接读 localStorage，不碰 IndexedDB', async () => {
    localStorage.setItem('shijinran.storage.engine', 'ls')
    localStorage.setItem(STORAGE_KEY, legacyJson(3))
    const openLedger = await freshOpenLedger()
    opened = await openLedger()
    expect(opened.engine).toBe('ls')
    expect(opened.state.txs).toHaveLength(3)
  })

  it('IndexedDB 不可用时回退旧存储', async () => {
    globalThis.indexedDB = undefined as unknown as IDBFactory
    localStorage.setItem(STORAGE_KEY, legacyJson(2))
    const openLedger = await freshOpenLedger()
    opened = await openLedger()
    expect(opened.engine).toBe('ls')
    expect(opened.state.txs).toHaveLength(2)
  })

  it('迁移后仓库可以继续单条写入', async () => {
    localStorage.setItem(STORAGE_KEY, legacyJson(2))
    const openLedger = await freshOpenLedger()
    opened = await openLedger()
    await opened.repo.putTx({
      id: 'new-tx',
      type: 'expense',
      amount: 999,
      categoryId: 'food',
      note: '',
      date: '2026-11-14',
      createdAt: 99,
    })
    const back = await opened.repo.load()
    expect(back!.txs.some((tx) => tx.id === 'new-tx')).toBe(true)
    expect(back!.txs).toHaveLength(3)
  })
})
