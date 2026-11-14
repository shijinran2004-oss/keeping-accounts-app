import { describe, expect, it } from 'vitest'
import type { LedgerState, Tx } from '../../types'
import { freshState } from '../normalize'
import { applyImport } from './apply'
import { gzipSupported } from './codec'
import { buildBackup } from './export'
import { checksumOf, isEnvelope } from './format'
import { parseBackup } from './parse'
import { buildPreview } from './preview'

function makeTx(id: string, extra: Partial<Tx> = {}): Tx {
  return {
    id,
    type: 'expense',
    amount: 1200,
    categoryId: 'food',
    note: '',
    date: '2026-11-01',
    createdAt: 1,
    ...extra,
  }
}

function withTxs(...txs: Tx[]): LedgerState {
  const state = freshState()
  state.txs = txs
  return state
}

describe('checksumOf', () => {
  it('同一内容得到同一个校验和，内容变化则变化', () => {
    expect(checksumOf('hello')).toBe(checksumOf('hello'))
    expect(checksumOf('hello')).not.toBe(checksumOf('hello!'))
    expect(checksumOf('hello')).toMatch(/^fnv1a32:[0-9a-f]{8}$/)
  })
})

describe('buildBackup / parseBackup', () => {
  it('v2 容器可以原样读回', async () => {
    const state = withTxs(makeTx('a'), makeTx('b', { type: 'income', amount: 5000, categoryId: 'salary' }))
    const built = await buildBackup(state, '2026-11-14')
    expect(built.compressed).toBe(false)
    expect(built.fileName.endsWith('.json')).toBe(true)

    const parsed = JSON.parse(built.text)
    expect(isEnvelope(parsed)).toBe(true)
    expect(parsed.counts.txs).toBe(2)

    const back = await parseBackup({ text: built.text })
    expect(back.meta.schema).toBe(2)
    expect(back.state.txs.map((tx) => tx.id).sort()).toEqual(['a', 'b'])
    expect(back.warnings).toHaveLength(0)
  })

  it('旧版裸 JSON 也能读，并给出兼容提示', async () => {
    const legacy = JSON.stringify(withTxs(makeTx('old')))
    const back = await parseBackup({ text: legacy })
    expect(back.meta.schema).toBe(1)
    expect(back.state.txs).toHaveLength(1)
    expect(back.warnings.join('')).toContain('旧版')
  })

  it('gzip 备份按魔数自动识别', async () => {
    if (!gzipSupported()) return
    const state = withTxs(makeTx('a'), makeTx('b'))
    const built = await buildBackup(state, '2026-11-14', { compress: true })
    expect(built.bytes).not.toBeNull()
    expect(built.compressed).toBe(true)
    expect(built.bytes!.length).toBeLessThan(built.originalBytes)

    const back = await parseBackup({ bytes: built.bytes! })
    expect(back.meta.compressed).toBe(true)
    expect(back.state.txs).toHaveLength(2)
  })

  it('乱码与空内容给出可读错误', async () => {
    await expect(parseBackup({ text: '' })).rejects.toThrow('备份内容为空')
    await expect(parseBackup({ text: 'not json' })).rejects.toThrow('不是有效的 JSON')
    await expect(parseBackup({ text: '{"version":2}' })).rejects.toThrow('备份内容不完整')
  })

  it('校验和不一致只提示，仍尽量恢复', async () => {
    const state = withTxs(makeTx('a'))
    const built = await buildBackup(state, '2026-11-14')
    const value = JSON.parse(built.text)
    value.checksum = 'fnv1a32:00000000'
    const back = await parseBackup({ text: JSON.stringify(value) })
    expect(back.state.txs).toHaveLength(1)
    expect(back.warnings.join('')).toContain('校验和')
  })
})

describe('applyImport', () => {
  const current = withTxs(makeTx('a', { amount: 100 }), makeTx('b', { amount: 200 }))
  const backup = awaitBackup([makeTx('a', { amount: 100 }), makeTx('c', { amount: 300 })])

  function awaitBackup(txs: Tx[]) {
    return {
      state: withTxs(...txs),
      meta: { schema: 2, txCount: txs.length, categoryCount: 18, compressed: false },
      warnings: [],
    }
  }

  it('覆盖模式直接换成备份内容', () => {
    const { state, outcome } = applyImport(backup, current, 'replace')
    expect(state.txs.map((tx) => tx.id).sort()).toEqual(['a', 'c'])
    expect(outcome.added).toBe(2)
  })

  it('合并模式按 id 去重并统计新增 / 相同', () => {
    const { state, outcome } = applyImport(backup, current, 'merge')
    expect(state.txs.map((tx) => tx.id).sort()).toEqual(['a', 'b', 'c'])
    expect(outcome.added).toBe(1)
    expect(outcome.unchanged).toBe(1)
    expect(outcome.updated).toBe(0)
  })

  it('合并时同 id 取更晚的一条', () => {
    const newer = { state: withTxs(makeTx('a', { amount: 999, createdAt: 99 })), meta: backup.meta, warnings: [] }
    const { state, outcome } = applyImport(newer, current, 'merge')
    expect(state.txs.find((tx) => tx.id === 'a')!.amount).toBe(999)
    expect(outcome.updated).toBe(1)
  })

  it('仅设置模式保留现有流水，分类取并集', () => {
    const { state, outcome } = applyImport(backup, current, 'settings')
    expect(state.txs).toHaveLength(2)
    expect(state.categories.some((category) => category.id === 'food')).toBe(true)
    expect(outcome.added).toBe(0)
  })

  it('合并会带上备份里独有的分类', () => {
    const withCat = {
      state: withTxs(makeTx('d')),
      meta: backup.meta,
      warnings: [],
    }
    withCat.state.categories = [
      ...withCat.state.categories,
      { id: 'custom-cat', name: '咖啡', icon: 'coffee', color: '#123456', type: 'expense' },
    ]
    const { state } = applyImport(withCat, current, 'merge')
    expect(state.categories.some((category) => category.id === 'custom-cat')).toBe(true)
    expect(state.categories.some((category) => category.id === 'food')).toBe(true)
  })

  it('仅设置模式会替换设置', () => {
    const incoming = {
      state: withTxs(),
      meta: backup.meta,
      warnings: [],
    }
    incoming.state.settings = { ...incoming.state.settings, salary: 12345 }
    const { state } = applyImport(incoming, current, 'settings')
    expect(state.settings.salary).toBe(12345)
    expect(state.txs).toHaveLength(2)
  })

  it('预览会给出日期范围与对比数字', () => {
    const preview = buildPreview(backup, current, 'merge')
    expect(preview.dateFrom).toBe('2026-11-01')
    expect(preview.toAdd).toBe(1)
    expect(preview.replaceCount).toBe(0)
  })
})
