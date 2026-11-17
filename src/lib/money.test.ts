import { describe, expect, it } from 'vitest'
import { formatMoney } from './money'

describe('formatMoney', () => {
  it('负的小数分取整后为 0 时不带负号', () => {
    expect(formatMoney(-0.4)).toBe('0.00')
    expect(formatMoney(-0.49)).toBe('0.00')
  })

  it('负数正常显示负号', () => {
    expect(formatMoney(-1234)).toBe('-12.34')
    expect(formatMoney(-0.6)).toBe('-0.01')
  })

  it('正数与整数分', () => {
    expect(formatMoney(0)).toBe('0.00')
    expect(formatMoney(4567)).toBe('45.67')
    expect(formatMoney(100)).toBe('1.00')
  })
})
