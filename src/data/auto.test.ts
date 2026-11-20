import { describe, expect, it } from 'vitest'
import type { Category } from '../types'
import { autoRecordToTx } from './auto'

const CATEGORIES = [{ id: 'shopping' }, { id: 'food' }, { id: 'other' }] as Category[]

const PAY = '支付成功\n￥11.11\n商户：便利蜂便利店\n实付金额 ￥11.11\n2026-11-15 00:31:22'

describe('autoRecordToTx', () => {
  it('把通知里确认的一笔补成完整账目', () => {
    const tx = autoRecordToTx({ amountCents: 1111, text: PAY, createdAt: 1700000000000 }, CATEGORIES)
    expect(tx).not.toBeNull()
    expect(tx?.amount).toBe(1111)
    expect(tx?.type).toBe('expense')
    // 「便利店」是餐饮关键词，靠关键词自动分类
    expect(tx?.categoryId).toBe('food')
    expect(tx?.note).toBe('便利蜂便利店')
    expect(tx?.date).toBe('2026-11-15')
    expect(tx?.createdAt).toBe(1700000000000)
    expect(tx?.id).toBeTruthy()
  })

  it('原生把 2820 当 ¥2820 时改回解析出来的 ¥28.20', () => {
    const tx = autoRecordToTx(
      { amountCents: 282000, text: '购物小票\n合计 2820', createdAt: 1 },
      CATEGORIES,
      {},
      '2026-11-15',
    )
    expect(tx?.amount).toBe(2820)
  })

  it('外卖算餐饮', () => {
    const tx = autoRecordToTx(
      {
        amountCents: 2345,
        text: '支付成功\n￥ 23.45\n商户：美团外卖\n实付金额￥23.45\n2026-11-15 00:31:22',
        createdAt: 1,
      },
      CATEGORIES,
      {},
      '2026-11-15',
    )
    expect(tx?.categoryId).toBe('food')
    expect(tx?.note).toBe('美团外卖')
  })

  it('商户记忆压过关键词：这家店上次记成购物就还记购物', () => {
    const tx = autoRecordToTx({ amountCents: 1111, text: PAY, createdAt: 1 }, CATEGORIES, {
      便利蜂便利店: 'shopping',
    })
    expect(tx?.categoryId).toBe('shopping')
  })

  it('原生已经给出分类时以它为准（它用过可能更新的商户记忆）', () => {
    const tx = autoRecordToTx(
      { amountCents: 1111, text: PAY, categoryId: 'other', createdAt: 1 },
      CATEGORIES,
    )
    expect(tx?.categoryId).toBe('other')
  })

  it('交易单号透传，seq 决定 id，重复落库不会多记', () => {
    const tx = autoRecordToTx(
      { amountCents: 1111, text: PAY, seq: 42, orderId: '4200001234', createdAt: 1 },
      CATEGORIES,
    )
    expect(tx?.id).toBe('auto-42')
    expect(tx?.orderId).toBe('4200001234')
  })

  it('没有金额就不入账', () => {
    expect(autoRecordToTx({ amountCents: 0, text: '随便聊聊', createdAt: 1 }, CATEGORIES)).toBeNull()
  })
})
