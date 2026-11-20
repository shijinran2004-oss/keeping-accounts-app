import { describe, expect, it } from 'vitest'
import type { Tx } from '../../types'
import { decodeBillBytes } from './csv'
import { parseBillCsv, planBillImport } from './bill'
import { buildLedgerCsv } from './export'

const ALIPAY = [
  '支付宝交易记录明细查询',
  '账号:[test@example.com]',
  '起始日期:[2026-10-01 00:00:00]    终止日期:[2026-11-20 23:59:59]',
  '---------------------------------交易记录明细列表------------------------------------',
  '交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注',
  '2026-11-16 19:55:01,商业服务,芜湖市丰宜科技有限公司,,先购后付,支出,3.59,余额,交易成功,2026111622001,,',
  '2026-11-15 23:56:40,日用百货,拼多多平台商户,,商户单号XP242,支出,5.90,花呗,交易成功,2026111522002,,',
  '2026-11-14 10:00:00,投资理财,长盛基金管理有限公司,,余额宝-收益发放,收入,0.01,余额宝,交易成功,2026111422003,,',
  '2026-11-13 09:00:00,商业服务,某商户,,退款,支出,12.00,余额,交易关闭,2026111322004,,',
  '2026-11-12 09:15:12,信用借还,花呗,,花呗主动还款,不计收支,83.85,银行卡,交易成功,2026111222005,,不计收支',
].join('\r\n')

const WECHAT = [
  '微信支付账单明细,,,,,,,,',
  '微信昵称：[测试]',
  '起始时间：[2026-10-01 00:00:00] 终止时间：[2026-11-20 23:59:59]',
  '共3笔记录',
  '----------------------微信支付账单明细列表--------------------',
  '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
  '2026-11-16 12:30:00,商户消费,麦当劳,"双层吉士汉堡, 可乐",支出,12.30,零钱,支付成功,4200001,10001,',
  '2026-11-16 13:00:00,转账,妈妈,,收入,100.00,零钱,已存入零钱,100005,,',
  '2026-11-17 09:00:00,商户消费,京东,,支出,"1,234.56",银行卡,已全额退款,4200003,10003,',
  '----------------------微信支付账单明细列表--------------------',
].join('\n')

describe('账单 CSV 解析', () => {
  it('支付宝账单能认出来，跳过不计收支和关闭的交易', () => {
    const bill = parseBillCsv(ALIPAY)
    expect(bill.source).toBe('alipay')
    expect(bill.total).toBe(5)
    expect(bill.skipped).toBe(2)
    expect(bill.rows).toHaveLength(3)
    expect(bill.rows[0]).toMatchObject({ date: '2026-11-16', type: 'expense', amount: 359 })
    expect(bill.rows[0].note).toContain('芜湖市丰宜科技有限公司')
    expect(bill.rows[2]).toMatchObject({ date: '2026-11-14', type: 'income', amount: 1, categoryId: 'invest' })
    expect(bill.dateFrom).toBe('2026-11-14')
    expect(bill.dateTo).toBe('2026-11-16')
  })

  it('微信账单能认出来，带逗号的商品名与千分位金额都正确', () => {
    const bill = parseBillCsv(WECHAT)
    expect(bill.source).toBe('wechat')
    expect(bill.rows).toHaveLength(2)
    expect(bill.rows[0]).toMatchObject({ type: 'expense', amount: 1230, note: '麦当劳 · 双层吉士汉堡, 可乐' })
    expect(bill.rows[1]).toMatchObject({ type: 'income', amount: 10000 })
    // 已全额退款的行跳过
    expect(bill.skipped).toBe(1)
  })

  it('交易单号能读出来：支付宝取「交易订单号」，微信取「交易单号」', () => {
    const alipay = parseBillCsv(ALIPAY)
    expect(alipay.rows[0].orderId).toBe('2026111622001')
    const wechat = parseBillCsv(WECHAT)
    expect(wechat.rows[0].orderId).toBe('4200001')
  })

  it('不是账单 CSV 时给出人话错误', () => {
    expect(() => parseBillCsv('姓名,年龄\n张三,18')).toThrow(/表头/)
  })

  it('UTF-8 BOM 的文件能解码', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('交易时间,金额')])
    expect(decodeBillBytes(bytes.buffer)).toBe('交易时间,金额')
  })
})

function tx(over: Partial<Tx>): Tx {
  return {
    id: 't',
    type: 'expense',
    amount: 359,
    categoryId: 'other',
    note: '先购后付',
    date: '2026-11-16',
    createdAt: 0,
    ...over,
  }
}

describe('账单导入计划', () => {
  it('账本为空时全部新增', () => {
    const plan = planBillImport(parseBillCsv(ALIPAY), [])
    expect(plan.fresh).toBe(3)
    expect(plan.duplicate).toBe(0)
    expect(plan.drafts.every((d) => d.date >= '2026-11-14')).toBe(true)
    expect(plan.drafts.every((d) => d.orderId)).toBe(true)
  })

  it('同一份账单导入第二次全部跳过', () => {
    const bill = parseBillCsv(ALIPAY)
    const existing = planBillImport(bill, []).drafts.map((draft, i) =>
      tx({ id: 'x' + i, type: draft.type, amount: draft.amount, note: draft.note, date: draft.date }),
    )
    const plan = planBillImport(bill, existing)
    expect(plan.fresh).toBe(0)
    expect(plan.duplicate).toBe(3)
  })

  it('交易单号相同就算同一笔：金额被改过也能认出来', () => {
    const bill = parseBillCsv(WECHAT)
    // 账本里这笔的金额和备注都和账单对不上，但单号一致
    const plan = planBillImport(bill, [tx({ orderId: '4200001', amount: 9999, note: '改过的备注' })])
    expect(plan.duplicate).toBe(1)
    expect(plan.fresh).toBe(1)
    expect(plan.drafts[0].orderId).toBe('100005')
  })

  it('同一天同价同店买两次，第二次仍然能导入（按出现次数抵消）', () => {
    const bill = parseBillCsv(WECHAT)
    const plan = planBillImport(bill, [
      tx({ amount: 1230, note: '麦当劳 · 双层吉士汉堡, 可乐', date: '2026-11-16' }),
    ])
    expect(plan.duplicate).toBe(1)
    expect(plan.fresh).toBe(1)
    expect(plan.drafts[0].amount).toBe(10000)
  })
})

describe('流水导出', () => {
  it('导出 CSV 带 BOM、金额两位小数、备注里的逗号会被引号包住', () => {
    const state = {
      version: 1 as const,
      txs: [
        tx({ note: '双层吉士汉堡, 可乐', amount: 1230, categoryId: 'food', date: '2026-11-16' }),
        tx({ id: 'b', type: 'income', note: '工资', amount: 1000000, categoryId: 'side', date: '2026-11-15' }),
      ],
      categories: [
        { id: 'food', name: '餐饮', icon: 'utensils' as const, color: '#000', type: 'expense' as const, builtin: true },
        { id: 'side', name: '兼职', icon: 'briefcase' as const, color: '#000', type: 'income' as const, builtin: true },
      ],
      settings: { salary: 0, fixedCost: 0, onboarded: true },
    }
    const csv = buildLedgerCsv(state)
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(csv).toContain('"双层吉士汉堡, 可乐"')
    expect(csv).toContain('12.30')
    expect(csv).toContain('10000.00')
    // 日期升序：11-15 的工资在前
    expect(csv.indexOf('工资')).toBeLessThan(csv.indexOf('双层吉士汉堡'))
  })
})
