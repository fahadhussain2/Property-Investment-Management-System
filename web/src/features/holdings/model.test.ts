import { describe, expect, it } from 'vitest'
import { metalSchema, rateSchema, vehicleSchema } from './schema'
import { daysBetween, filterHoldings, formatCc, isStaleRate, statusCounts, vehicleTitle } from './model'

const rows = [
  { code: 'CAR-1', name: 'Family car', status: 'held' as const, make: 'Toyota', model: 'Corolla', registration_no: 'LEA-123' },
  { code: 'CAR-2', name: null, status: 'sold' as const, make: 'Honda', model: 'City', registration_no: null },
  { code: 'G-01', name: 'Bridal set', status: 'partly_sold' as const },
]

describe('holdings registers', () => {
  it('filters by status and searches code, name, make, model and registration', () => {
    expect(filterHoldings(rows, { status: 'sold' }).map((r) => r.code)).toEqual(['CAR-2'])
    expect(filterHoldings(rows, { q: 'corolla' }).map((r) => r.code)).toEqual(['CAR-1'])
    expect(filterHoldings(rows, { q: 'lea-1' }).map((r) => r.code)).toEqual(['CAR-1'])
    expect(filterHoldings(rows, { q: 'bridal' }).map((r) => r.code)).toEqual(['G-01'])
    expect(statusCounts(rows)).toEqual({ all: 3, held: 1, partly_sold: 1, sold: 1 })
  })

  it('flags a rate older than 7 days', () => {
    expect(daysBetween('2026-09-01', '2026-09-29')).toBe(28)
    expect(isStaleRate('2026-09-22', '2026-09-29')).toBe(false)
    expect(isStaleRate('2026-09-21', '2026-09-29')).toBe(true)
    expect(isStaleRate(null, '2026-09-29')).toBe(false)
  })

  it('names a vehicle from what is filled in', () => {
    expect(vehicleTitle({ make: 'Toyota', model: 'Corolla', year: 2022 })).toBe('Toyota Corolla 2022')
    expect(vehicleTitle({ make: null, model: 'City', year: null })).toBe('City')
  })

  it('shows engine capacity in cc', () => {
    expect(formatCc(1300)).toBe('1,300 cc')
    expect(formatCc(660)).toBe('660 cc')
  })

  it('validates vehicle, metal and rate forms', () => {
    expect(vehicleSchema.parse({ code: 'CAR-1', year: '2022', make: '' })).toMatchObject({ code: 'CAR-1', year: 2022, make: null })
    expect(vehicleSchema.safeParse({ code: 'CAR-1', year: '22' }).success).toBe(false)
    expect(vehicleSchema.parse({ code: 'CAR-1', engine_cc: '1,300' }).engine_cc).toBe(1300)
    expect(vehicleSchema.parse({ code: 'CAR-1', engine_cc: '' }).engine_cc).toBeNull()
    for (const bad of ['0', '1300.5', '1.3L', '25000']) expect(vehicleSchema.safeParse({ code: 'CAR-1', engine_cc: bad }).success).toBe(false)
    expect(metalSchema.parse({ code: 'G-01', purity: '0.9167' }).purity).toBe('0.9167')
    expect(metalSchema.safeParse({ code: 'G-01', purity: '' }).success).toBe(false)
    expect(metalSchema.safeParse({ code: 'G-01', purity: '1.5' }).success).toBe(false)
    expect(rateSchema.parse({ rate_date: '2026-09-29', rate_per_tola: '250,000' }).rate_per_tola).toBe('250000.00')
    expect(rateSchema.safeParse({ rate_date: '2026-09-29', rate_per_tola: '0' }).success).toBe(false)
  })
})
