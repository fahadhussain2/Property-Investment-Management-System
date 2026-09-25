import { describe, expect, it } from 'vitest'
import { add, formatMoney, isNegative, parseMoney, sub, sum } from './money'

describe('money', () => {
  it('parses user input to 2dp strings', () => {
    expect(parseMoney('12,500,000')).toBe('12500000.00')
    expect(parseMoney(' 1500.5 ')).toBe('1500.50')
    expect(() => parseMoney('12.345')).toThrow()
    expect(() => parseMoney('abc')).toThrow()
  })

  it('does exact decimal arithmetic (no float drift)', () => {
    expect(add('0.10', '0.20')).toBe('0.30')
    expect(sub('12500000.00', '10200000.00')).toBe('2300000.00')
    expect(sum(['50000.00', '50000.00', '50000.00', '240000.00'])).toBe('390000.00')
    expect(isNegative(sub('0.00', '30000.00'))).toBe(true)
  })

  it('formats for display', () => {
    expect(formatMoney('12500000.00')).toBe('Rs 12,500,000')
    expect(formatMoney('-30000.50')).toBe('-Rs 30,000.50')
    expect(formatMoney('0.00')).toBe('Rs 0')
  })
})
