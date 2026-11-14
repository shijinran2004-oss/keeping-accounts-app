import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshState } from '../normalize'
import { migrateLegacyToIdb } from './migrate'
import { IdbRepository } from './repo'

describe('migrateLegacyToIdb', () => {
  let repo: IdbRepository

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory
    repo = await IdbRepository.open()
  })

  afterEach(() => {
    repo.close()
  })

  it('把旧账本搬进空库并校验通过', async () => {
    const legacy = freshState()
    legacy.txs = Array.from({ length: 12 }, (_, i) => ({
      id: `tx-${i}`,
      type: 'expense' as const,
      amount: i + 1,
      categoryId: 'food',
      note: '',
      date: '2026-11-01',
      createdAt: i,
    }))
    legacy.settings.salary = 8888

    await expect(migrateLegacyToIdb(repo, legacy)).resolves.toBe(true)
    const back = await repo.load()
    expect(back!.txs).toHaveLength(12)
    expect(back!.settings.salary).toBe(8888)
  })

  it('库里有记录时跳过，不覆盖迁移后新记的账', async () => {
    const newer = freshState()
    newer.txs = [{ id: 'new', type: 'expense', amount: 1, categoryId: 'food', note: '', date: '2026-11-02', createdAt: 2 }]
    await repo.replaceAll(newer)

    const legacy = freshState()
    legacy.txs = [{ id: 'old', type: 'expense', amount: 2, categoryId: 'food', note: '', date: '2026-11-03', createdAt: 3 }]
    await expect(migrateLegacyToIdb(repo, legacy)).resolves.toBe(false)
    expect((await repo.load())!.txs.map((t) => t.id)).toEqual(['new'])
  })

  it('迁移后自定义分类仍然保留', async () => {
    const legacy = freshState()
    legacy.categories = [...legacy.categories, { id: 'custom-x', name: '咖啡', icon: 'coffee', color: '#123456', type: 'expense' }]
    await migrateLegacyToIdb(repo, legacy)
    const back = await repo.load()
    expect(back!.categories.some((c) => c.id === 'custom-x')).toBe(true)
  })
})
