import { describe, expect, it } from 'vitest'
import type { Category, Settings } from '../types'
import {
  buildHints,
  guessCategory,
  merchantOfNote,
  rememberMerchant,
  scoreCategories,
  suggestCategories,
} from './hints'

const CATEGORIES = [
  { id: 'food', name: '餐饮' },
  { id: 'shopping', name: '购物' },
  { id: 'transport', name: '交通' },
] as Category[]

const SETTINGS = { salary: 0, fixedCost: 0, onboarded: true } as Settings

describe('merchantOfNote', () => {
  it('取第一个「·」前面的店名，去掉「商户：」前缀', () => {
    expect(merchantOfNote('星巴克 · 拿铁')).toBe('星巴克')
    expect(merchantOfNote('商户：便利蜂便利店')).toBe('便利蜂便利店')
    expect(merchantOfNote('')).toBe('')
  })
})

describe('scoreCategories', () => {
  it('商户名命中关键词排最前，整页文字命中算一分', () => {
    const scored = scoreCategories(CATEGORIES, '支付成功 ￥23.45 外卖 打车', '美团外卖')
    expect(scored[0].id).toBe('food')
    // 商户名命中 +3，同一页文字再命中 +1
    expect(scored[0].score).toBe(4)
    expect(scored.some((item) => item.score === 1)).toBe(true)
  })

  it('商户记忆 +20，压过其他关键词', () => {
    const scored = scoreCategories(CATEGORIES, '支付成功 ￥23.45 外卖订单', '美团外卖', {
      美团外卖: 'shopping',
    })
    expect(scored[0].id).toBe('shopping')
    expect(scored[0].score).toBeGreaterThanOrEqual(20)
  })
})

describe('guessCategory', () => {
  it('最高分唯一时才给分类，同分不乱猜', () => {
    expect(guessCategory(CATEGORIES, '', '美团外卖')).toBe('food')
    expect(guessCategory(CATEGORIES, '外卖 打车', '')).toBeNull()
    expect(guessCategory(CATEGORIES, '今天天气不错', '')).toBeNull()
  })
})

describe('suggestCategories', () => {
  it('当前选中的排最前，其余按分数补足', () => {
    const picked = suggestCategories(CATEGORIES, '外卖订单', '美团外卖', {}, 'shopping')
    expect(picked[0]).toMatchObject({ id: 'shopping', keyword: '当前' })
    expect(picked[1].id).toBe('food')
  })
})

describe('rememberMerchant', () => {
  it('没变化时返回原对象，调用方可以靠引用判断要不要落盘', () => {
    const once = rememberMerchant(SETTINGS, '星巴克', 'food')
    expect(once).not.toBe(SETTINGS)
    expect(rememberMerchant(once, '星巴克', 'food')).toBe(once)
    expect(rememberMerchant(once, '  ', 'food')).toBe(once)
  })

  it('最多记 300 家，超出先丢最早的', () => {
    let settings = SETTINGS
    for (let i = 0; i < 300; i += 1) settings = rememberMerchant(settings, `店${i}`, 'food')
    expect(Object.keys(settings.merchantRules ?? {})).toHaveLength(300)
    const more = rememberMerchant(settings, '新店', 'food')
    expect(more.merchantRules?.['店0']).toBeUndefined()
    expect(more.merchantRules?.['新店']).toBe('food')
    expect(Object.keys(more.merchantRules ?? {})).toHaveLength(300)
  })
})

describe('buildHints', () => {
  it('把分类关键词表整理成给原生的形状', () => {
    const hints = buildHints(CATEGORIES)
    expect(hints.map((hint) => hint.id)).toEqual(['food', 'shopping', 'transport'])
    expect(hints[0].keywords).toContain('外卖')
  })
})
