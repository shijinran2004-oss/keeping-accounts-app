import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import rules from './capture-rules.json'

// 规则表的唯一来源是 src/lib/ocr/capture-rules.json，
// Android 打包用的 assets 副本必须逐字节一致，否则线上行为和测试校验的规则会悄悄分叉。
const SOURCE = new URL('./capture-rules.json', import.meta.url)
const ASSET = new URL(
  '../../../android/app/src/main/assets/rules/capture-rules.json',
  import.meta.url,
)

const GLOBAL_ARRAYS = [
  'amountKeys',
  'totalKeys',
  'payContext',
  'paymentSignals',
  'merchantKeys',
  'strongSignals',
  'ownCard',
  'penaltyKeys',
  'balanceKeys',
  'incomeWords',
  'notIncomeWords',
  'notExpenseWords',
] as const

describe('capture-rules 规则表', () => {
  it('打包副本与源文件字节一致', () => {
    expect(readFileSync(ASSET, 'utf8')).toBe(readFileSync(SOURCE, 'utf8'))
  })

  it('每个全局词表都非空且没有重复', () => {
    for (const key of GLOBAL_ARRAYS) {
      const list = rules.global[key]
      expect(list.length, key).toBeGreaterThan(0)
      expect(new Set(list).size, key).toBe(list.length)
    }
  })

  it('三个平台模板齐全，各自都有识别词和金额锚点', () => {
    expect(rules.templates.map((t) => t.id)).toEqual(['alipay', 'wechat', 'bank'])
    for (const template of rules.templates) {
      expect(template.anyKeywords.length).toBeGreaterThan(0)
      expect(template.anchors.length).toBeGreaterThan(0)
      expect(new Set(template.anyKeywords).size).toBe(template.anyKeywords.length)
    }
  })

  it('支付宝模板带「账单详情」版面词，并允许认标题大金额', () => {
    const alipay = rules.templates.find((t) => t.id === 'alipay')
    expect(alipay?.headerAmount).toBe(true)
    expect(alipay?.detailKeys.length).toBeGreaterThan(0)
  })

  it('支付宝模板还有确认词，不能只靠「账单详情」就判成支付宝', () => {
    const alipay = rules.templates.find((t) => t.id === 'alipay')
    expect(alipay?.confirmKeywords?.length ?? 0).toBeGreaterThan(0)
    // 美团账单详情页也有「订单金额」，支付宝模板不能再拿它当实付
    expect(alipay?.anchors).not.toContain('订单金额')
  })

  it('通知规则白名单只认微信/支付宝/银行，词表齐全', () => {
    const notify = rules.notification
    const packages = Object.keys(notify.packages)
    expect(packages).toContain('com.tencent.mm')
    expect(packages).toContain('com.eg.android.AlipayGphone')
    // 白名单里的每个平台都得有给人看的名字
    for (const platform of Object.values(notify.packages)) {
      expect(Object.keys(notify.platformNames)).toContain(platform)
    }
    const arrays = [
      'ignoreKeywords',
      'expenseKeywords',
      'incomeKeywords',
      'refundKeywords',
      'penaltyKeywords',
      'merchantPatterns',
    ] as const
    for (const key of arrays) {
      expect(notify[key].length, key).toBeGreaterThan(0)
      expect(new Set(notify[key]).size, key).toBe(notify[key].length)
    }
    // 调试用的假白名单（adb shell 发通知）不能留在发布规则里
    expect(packages).not.toContain('com.android.shell')
    expect(packages).not.toContain('android')
    expect(notify.expenseKeywords).toContain('付款成功')
    expect(notify.refundKeywords).toContain('退款成功')
    expect(notify.ignoreKeywords).toContain('验证码')
  })

  it('版面权重在合理区间（大字放大、页脚扣分）', () => {
    const geo = rules.geometry
    expect(geo.bigRatio).toBeGreaterThan(1)
    expect(geo.topRatio).toBeGreaterThan(0)
    expect(geo.topRatio).toBeLessThan(1)
    expect(geo.footerPenalty).toBeLessThan(0)
    expect(geo.layoutBase).toBeGreaterThan(0)
  })
})
