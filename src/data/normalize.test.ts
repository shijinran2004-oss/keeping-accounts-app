import { describe, expect, it } from 'vitest'
import { freshState, normalize } from './normalize'

describe('normalize', () => {
  it('拒绝结构不完整的数据', () => {
    expect(normalize(null)).toBeNull()
    expect(normalize({ txs: [] })).toBeNull()
    expect(normalize('not an object')).toBeNull()
  })

  it('保留用户改过的内置分类，并补回缺失的内置分类', () => {
    const state = normalize({
      txs: [],
      categories: [{ id: 'food', name: '吃饭', icon: 'coffee', color: '#000', type: 'expense', builtin: true }],
      settings: {},
    })
    const food = state!.categories.find((c) => c.id === 'food')!
    expect(food.name).toBe('吃饭')
    expect(food.icon).toBe('coffee')
    expect(state!.categories.length).toBeGreaterThan(10)
  })

  it('丢弃无效流水，保留有效流水', () => {
    const state = normalize({
      txs: [
        { id: 'a', type: 'expense', amount: 100, categoryId: 'food', note: '', date: '2026-11-01', createdAt: 1 },
        { id: 'b', type: 'weird', amount: 100, categoryId: 'food', date: '2026-11-01' },
        { id: 3 },
      ],
      categories: [],
      settings: {},
    })
    expect(state!.txs.map((t) => t.id)).toEqual(['a'])
  })

  it('清洗到账日覆盖与头像', () => {
    const state = normalize({
      txs: [],
      categories: [],
      settings: {
        avatar: 'javascript:alert(1)',
        paydayOverrides: { '2026-11': 16, '2026-13': 5, '2026-12': 40 },
      },
    })
    expect(state!.settings.avatar).toBeUndefined()
    expect(state!.settings.paydayOverrides).toEqual({ '2026-11': 16 })
  })

  it('新装状态带默认账本名和 18 个内置分类', () => {
    const state = freshState()
    expect(state.settings.name).toBe('使劲燃的钱')
    expect(state.txs).toHaveLength(0)
    expect(state.categories).toHaveLength(18)
  })
})
