import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './dates'
import { describePeriod } from './periods'

describe('dates are shown as dd/mm/yyyy', () => {
  it('formats a business date as text, so it never shifts a day', () => {
    expect(formatDate('2026-10-04')).toBe('04/10/2026')
    expect(formatDate('2027-06-30')).toBe('30/06/2027')
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
  })

  it('formats a timestamp as its local date, and a moment with the time', () => {
    expect(formatDate(new Date(2026, 9, 4, 23, 59))).toBe('04/10/2026')
    expect(formatDate(new Date(2026, 0, 5).toISOString())).toBe('05/01/2026')
    expect(formatDateTime(new Date(2026, 9, 4, 15, 5))).toBe('04/10/2026, 3:05 pm')
    expect(formatDateTime(new Date(2026, 9, 4, 0, 30))).toBe('04/10/2026, 12:30 am')
    expect(formatDateTime(new Date(2026, 9, 4, 12, 0))).toBe('04/10/2026, 12:00 pm')
  })

  it('describes a report period in the same format', () => {
    expect(describePeriod({ from: '2026-07-01', to: '2027-06-30' })).toBe('01/07/2026 – 30/06/2027')
    expect(describePeriod({ from: '2000-01-01', to: '2100-12-31' })).toBe('All time')
  })
})
