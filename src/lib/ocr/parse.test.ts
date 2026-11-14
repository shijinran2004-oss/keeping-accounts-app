import { describe, expect, it } from 'vitest'
import type { OcrLine } from '../../types'
import { parseReceipt } from './parse'
import { pickAmount } from './amount'
import { pickDate } from './date'
import { pickMerchant } from './merchant'

/** 真机（模拟器）跑出来的小票文字行，顺序就是插件返回的顺序 */
const RECEIPT_TEXTS = [
  '每日鲜生活超市',
  '购物小票／SALESRECEIPT',
  '单号：NO.20261114-0731',
  '日期：2026-11-14 13:25:07',
  '收银员：A03',
  '机号：05',
  '商品名称',
  '数量',
  '金额',
  '伊利纯牛奶250ml',
  '2',
  '12.50',
  '全麦吐司面包',
  '1',
  '8.80',
  '香蕉500g',
  '1',
  '6.90',
  '农夫山泉550ml',
  '3',
  '6.00',
  '商品件数',
  '9',
  '合计金额',
  '¥34.20',
  '优惠减免',
  '-¥6.00',
  '实付金额',
  '¥28.20',
  '支付方式：微信支付',
  '找零：￥0.00',
  '地址：北京市朝阳区建国路88号',
  '电话：010-88886666',
  '谢谢惠顾欢迎再次光临',
]

const lines = (texts: string[]): OcrLine[] =>
  texts.map((text) => ({ text, score: 0.9, box: [] }))

describe('小票字段抽取', () => {
  it('金额取实付而不是合计或找零', () => {
    const best = pickAmount(lines(RECEIPT_TEXTS))
    expect(best?.cents).toBe(2820)
    expect(best?.confidence).toBeGreaterThan(0.6)
  })

  it('标签和金额分开两行也能认出来', () => {
    const best = pickAmount(lines(['实付金额', '¥28.20', '找零', '¥0.00']))
    expect(best?.cents).toBe(2820)
  })

  it('没有关键词时退化成最大的一笔带小数金额', () => {
    const best = pickAmount(lines(['12.50', '8.80', '6.90']))
    expect(best?.cents).toBe(1250)
    expect(best?.confidence).toBeLessThanOrEqual(0.4)
  })

  it('日期认出 2026-11-14，并且没被单号里的数字带偏', () => {
    const picked = pickDate(lines(RECEIPT_TEXTS), '2026-11-14')
    expect(picked?.date).toBe('2026-11-14')
  })

  it('只写月日时补上今年', () => {
    const picked = pickDate(lines(['消费日期 11月14日']), '2026-11-20')
    expect(picked?.date).toBe('2026-11-14')
  })

  it('未来的日期不会被当成消费日期', () => {
    const picked = pickDate(lines(['日期 2027-01-01', '日期 2026-11-10']), '2026-11-14')
    expect(picked?.date).toBe('2026-11-10')
  })

  it('商户取票头第一行，跳过单号/电话/地址', () => {
    const picked = pickMerchant(lines(RECEIPT_TEXTS))
    expect(picked?.name).toBe('每日鲜生活超市')
  })

  it('整张票能抽出草稿并猜出分类', () => {
    const draft = parseReceipt(lines(RECEIPT_TEXTS), { today: '2026-11-14' })
    expect(draft.amountCents).toBe(2820)
    expect(draft.date).toBe('2026-11-14')
    expect(draft.merchant).toBe('每日鲜生活超市')
    expect(draft.categoryId).toBe('shopping')
    expect(draft.confidence).toBeGreaterThan(0.6)
    expect(draft.text).toContain('实付金额')
    expect(draft.lines.length).toBe(RECEIPT_TEXTS.length)
  })

  it('空文字不会崩，字段全是 null', () => {
    const draft = parseReceipt([], { today: '2026-11-14' })
    expect(draft.amountCents).toBeNull()
    expect(draft.date).toBeNull()
    expect(draft.merchant).toBeNull()
    expect(draft.confidence).toBe(0)
  })

  it('餐饮小票会落到 food', () => {
    const draft = parseReceipt(lines(['老王牛肉面', '合计 ¥26.00', '2026-11-13']), { today: '2026-11-14' })
    expect(draft.categoryId).toBe('food')
    expect(draft.amountCents).toBe(2600)
  })

  it('全角数字和￥符号都能处理', () => {
    const best = pickAmount(lines(['实付金额 ￥２８．２０']))
    expect(best?.cents).toBe(2820)
  })
})
