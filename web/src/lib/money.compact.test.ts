import { describe, expect, it } from 'vitest'
import { formatCompact } from './money'

// 005 amendment 3: the short figures on the dashboard's cash / bank line.
describe('formatCompact', () => {
  it('says lakh and crore for PKR, at most two decimals', () => {
    expect(formatCompact('550000.00')).toBe('5.5 lakh')
    expect(formatCompact('5000000.00')).toBe('50 lakh')
    expect(formatCompact('1275000.00')).toBe('12.75 lakh')
    expect(formatCompact('11325000.00')).toBe('1.13 crore')
    expect(formatCompact('12500000.00')).toBe('1.25 crore')
    expect(formatCompact('500000000.00')).toBe('50 crore')
    expect(formatCompact('100000.00')).toBe('1 lakh')
    expect(formatCompact('10000000.00')).toBe('1 crore')
  })

  it('keeps amounts under a lakh exact', () => {
    expect(formatCompact('45000.00')).toBe('45,000')
    expect(formatCompact('99999.00')).toBe('99,999')
    expect(formatCompact('99999.99')).toBe('99,999.99')
    expect(formatCompact('0.00')).toBe('0')
  })

  it('rounds half up, and moves to crore rather than show 100 lakh', () => {
    expect(formatCompact('112500.00')).toBe('1.13 lakh')
    expect(formatCompact('9999999.00')).toBe('1 crore')
    expect(formatCompact('9994999.00')).toBe('99.95 lakh')
  })

  it('shows a minus for a negative balance (an overdrawn bank)', () => {
    expect(formatCompact('-250000.00')).toBe('-2.5 lakh')
    expect(formatCompact('-1000.00')).toBe('-1,000')
  })

  it('uses K and M for other currencies', () => {
    expect(formatCompact('5000000.00', 'USD')).toBe('5M')
    expect(formatCompact('250000.00', 'USD')).toBe('250K')
    expect(formatCompact('999999.00', 'USD')).toBe('1M')
    expect(formatCompact('999.50', 'USD')).toBe('999.50')
    expect(formatCompact('-1500.00', 'AED')).toBe('-1.5K')
  })
})
