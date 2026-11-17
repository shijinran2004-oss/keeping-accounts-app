import { beforeEach, describe, expect, it, vi } from 'vitest'
import { freshState } from '../normalize'

const replaceAll = vi.fn(async () => {})
const load = vi.fn()
const close = vi.fn()

vi.mock('./repo', () => ({
  IdbRepository: {
    open: vi.fn(async () => ({ load, replaceAll, close })),
  },
}))

let legacyState: ReturnType<typeof freshState>

vi.mock('./ls', () => ({
  readLegacyState: () => legacyState,
  writeLegacyMirror: vi.fn(),
  LsRepository: class {
    async load() {
      return null
    }
  },
}))

function existingState() {
  const s = freshState()
  s.txs = [{ id: 'new', type: 'expense', amount: 1, categoryId: 'food', note: '', date: '2026-11-02', createdAt: 2 }]
  return s
}

async function openLedgerForTest() {
  vi.resetModules()
  const mod = await import('./migrate')
  return mod.openLedger()
}

/** 让 openLedger 在读取阶段抛错：前面的判断用 given，最后一次正式读取抛错 */
function failAfter(...given: unknown[]) {
  load.mockReset()
  for (const value of given) load.mockResolvedValueOnce(value)
  load.mockRejectedValueOnce(new Error('boom'))
}

describe('openLedger 失败时的清库保护', () => {
  beforeEach(() => {
    replaceAll.mockClear()
    load.mockReset()
    close.mockClear()
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage
    globalThis.indexedDB = {} as IDBFactory

    legacyState = freshState()
    legacyState.txs = [
      { id: 'old', type: 'expense', amount: 2, categoryId: 'food', note: '', date: '2026-11-03', createdAt: 3 },
    ]
  })

  it('库里已有记录时，读取失败也不清库', async () => {
    // 判断有没有数据 → 已有；migrate 里再读一次 → 已有（跳过迁移）；正式读取 → 抛错
    failAfter(existingState(), existingState())

    const opened = await openLedgerForTest()
    expect(opened.engine).toBe('ls')
    expect(replaceAll).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  it('库是空的、迁移写完读取失败，才清掉本次写入', async () => {
    // 判断有没有数据 → 空；migrate 里读 → 空（会写入）；写完回读 → 抛错
    failAfter(null, null)

    const opened = await openLedgerForTest()
    expect(opened.engine).toBe('ls')
    // 第 1 次是迁移本身写入旧账本，第 2 次是失败后清库
    expect(replaceAll).toHaveBeenCalledTimes(2)
    expect(replaceAll.mock.calls[1][0].txs).toHaveLength(0)
  })
})
