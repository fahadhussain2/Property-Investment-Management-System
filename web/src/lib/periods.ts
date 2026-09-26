/** Reporting periods. Dates are ISO strings (YYYY-MM-DD) in the business's local calendar. */
export type Period = { from: string; to: string }
export type PresetKey = 'month' | 'fy' | 'last_fy' | 'all' | 'custom'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** The financial year containing `date`, for a year starting on the 1st of `startMonth` (1–12). */
export function fiscalYear(date: string, startMonth: number): Period {
  const [y, m] = date.split('-').map(Number)
  const startYear = m >= startMonth ? y : y - 1
  const endYear = startMonth === 1 ? startYear : startYear + 1
  const endMonth = startMonth === 1 ? 12 : startMonth - 1
  return { from: iso(startYear, startMonth, 1), to: iso(endYear, endMonth, lastDay(endYear, endMonth)) }
}

export function monthOf(date: string): Period {
  const [y, m] = date.split('-').map(Number)
  return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) }
}

/** "FY 2026–27" for a July–June year; "2026" for a calendar year. */
export function fiscalYearLabel(p: Period): string {
  const a = p.from.slice(0, 4)
  const b = p.to.slice(0, 4)
  return a === b ? a : `FY ${a}–${b.slice(2)}`
}

export const ALL_TIME: Period = { from: '2000-01-01', to: '2100-12-31' }

export function presetPeriod(key: Exclude<PresetKey, 'custom'>, today: string, startMonth: number): Period {
  switch (key) {
    case 'month':
      return monthOf(today)
    case 'fy':
      return fiscalYear(today, startMonth)
    case 'last_fy': {
      const current = fiscalYear(today, startMonth)
      const [y, m, d] = current.from.split('-').map(Number)
      const dayBefore = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
      return fiscalYear(dayBefore, startMonth)
    }
    case 'all':
      return ALL_TIME
  }
}

export function describePeriod(p: Period): string {
  if (p.from === ALL_TIME.from && p.to === ALL_TIME.to) return 'All time'
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(p.from)} – ${fmt(p.to)}`
}
