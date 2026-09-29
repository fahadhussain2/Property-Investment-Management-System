import { describe, expect, it } from 'vitest'
import { formatWeight, fromGrams, parseWeight, toGrams, unitToGrams } from './quantity'

describe('weights', () => {
  it('parses typed weights with up to 3 decimals, never zero', () => {
    expect(parseWeight('10')).toBe('10')
    expect(parseWeight('1,000.500')).toBe('1000.5')
    expect(() => parseWeight('1.0001')).toThrow()
    expect(() => parseWeight('0')).toThrow()
    expect(() => parseWeight('-1')).toThrow()
    expect(() => parseWeight('abc')).toThrow()
  })

  it('converts exactly: tola is 11.6638038 g', () => {
    expect(unitToGrams('10', 'tola')).toBe('116.638038')
    expect(unitToGrams('1', 'kg')).toBe('1000')
    // 1 kg + 5 tola (spec 003 scenario 5)
    expect(toGrams('1058.319019')).toBe('1058.319019')
    expect(fromGrams('81.6466266', 'tola')).toBe('7')
    expect(fromGrams('1058.319019', 'kg')).toBe('1.058')
  })

  it('formats with grouping and the unit', () => {
    expect(formatWeight('116.638038', 'tola')).toBe('10 tola')
    expect(formatWeight('1058.319019', 'g')).toBe('1,058.319 g')
    expect(formatWeight('0', 'tola')).toBe('0 tola')
  })
})
