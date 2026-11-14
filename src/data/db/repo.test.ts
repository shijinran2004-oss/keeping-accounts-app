import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SnapshotRecord, Tx } from '../../types'
import { freshState } from '../normalize'
import { IdbRepository } from './repo'

function makeTx(id: string, extra: Partial<Tx> = {}): Tx {
  return { id, type: 'expense', amount: 100, categoryId: 'food', note: '', date: '2026-11-01', createdAt: 1, ...extra }
}

describe('IdbRepository', () => {
  let repo: IdbRepository

  beforeEach(async () => {
    // 每个用例一个全新的内存数据库，互不干扰
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory
    repo = await IdbRepository.open()
  })

  afterEach(() => {
    repo.close()
  })

  it('空库 load 返回 null', async () => {
    expect(await repo.load()).toBeNull()
  })

  it('整份替换后能原样读回', async () => {
    const state = freshState()
    state.txs = [makeTx('a'), makeTx('b', { type: 'income', amount: 500 })]
    state.settings.salary = 123456
    await repo.replaceAll(state)

    const back = await repo.load()
    expect(back!.txs.map((t) => t.id).sort()).toEqual(['a', 'b'])
    expect(back!.settings.salary).toBe(123456)
    expect(back!.categories.length).toBeGreaterThan(10)
  })

  it('单笔新增 / 修改 / 删除只影响该笔', async () => {
    const state = freshState()
    state.txs = [makeTx('a')]
    await repo.replaceAll(state)

    await repo.putTx(makeTx('b'))
    await repo.putTx(makeTx('a', { amount: 999 }))
    let back = await repo.load()
    expect(back!.txs).toHaveLength(2)
    expect(back!.txs.find((t) => t.id === 'a')!.amount).toBe(999)

    await repo.deleteTx('b')
    back = await repo.load()
    expect(back!.txs.map((t) => t.id)).toEqual(['a'])
  })

  it('分类与设置可单独更新', async () => {
    await repo.replaceAll(freshState())
    await repo.putCategories([
      { id: 'custom-1', name: '咖啡', icon: 'coffee', color: '#123456', type: 'expense' },
    ])
    await repo.putSettings({ ...freshState().settings, salary: 100 })

    const back = await repo.load()
    expect(back!.categories.some((c) => c.id === 'custom-1')).toBe(true)
    expect(back!.settings.salary).toBe(100)
  })

  it('快照按时间倒序返回，正文可单独取', async () => {
    const snap = (id: string, createdAt: number): SnapshotRecord => ({
      id,
      kind: 'manual',
      createdAt,
      txCount: 1,
      bytes: 10,
      data: '{"version":1}',
    })
    await repo.putSnapshot(snap('s1', 1))
    await repo.putSnapshot(snap('s2', 2))

    const list = await repo.listSnapshots()
    expect(list.map((s) => s.id)).toEqual(['s2', 's1'])
    expect((await repo.getSnapshot('s1'))!.data).toBe('{"version":1}')

    await repo.deleteSnapshot('s1')
    expect((await repo.listSnapshots()).map((s) => s.id)).toEqual(['s2'])
  })
})
