import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'
import { fiscalYear, fiscalYearLabel, monthOf, presetPeriod } from './periods'

describe('financial years', () => {
  it('July–June year (Pakistan default)', () => {
    expect(fiscalYear('2026-09-26', 7)).toEqual({ from: '2026-07-01', to: '2027-06-30' })
    expect(fiscalYear('2026-06-30', 7)).toEqual({ from: '2025-07-01', to: '2026-06-30' })
    expect(fiscalYear('2026-07-01', 7)).toEqual({ from: '2026-07-01', to: '2027-06-30' })
    expect(fiscalYearLabel(fiscalYear('2026-09-26', 7))).toBe('FY 2026–27')
  })

  it('calendar year and a leap-year February end', () => {
    expect(fiscalYear('2026-09-26', 1)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(fiscalYearLabel(fiscalYear('2026-09-26', 1))).toBe('2026')
    expect(fiscalYear('2027-05-01', 3)).toEqual({ from: '2027-03-01', to: '2028-02-29' })
  })

  it('presets', () => {
    expect(monthOf('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(presetPeriod('last_fy', '2026-09-26', 7)).toEqual({ from: '2025-07-01', to: '2026-06-30' })
  })
})

describe('CSV', () => {
  it('quotes commas, quotes and newlines; keeps decimal strings exact', () => {
    expect(toCsv(['Name', 'Amount'], [['Ali, Raza', '12500000.00'], ['He said "hi"', '-30000.50'], ['a\nb', null]])).toBe(
      'Name,Amount\r\n"Ali, Raza",12500000.00\r\n"He said ""hi""",-30000.50\r\n"a\nb",',
    )
  })

  it('neutralises spreadsheet formulas in text, not in negative numbers', () => {
    expect(toCsv(['x'], [['=HYPERLINK("evil")'], ['+1+1'], ['@SUM(A1)'], ['-2300000.00']])).toBe(
      'x\r\n"\'=HYPERLINK(""evil"")"\r\n\'+1+1\r\n\'@SUM(A1)\r\n-2300000.00',
    )
  })
})
