import { describe, expect, it } from 'vitest'
import {
  endLabel,
  filterRoll,
  parseRollFilter,
  rentPosition,
  rollTotals,
  toRollRow,
  type RollRow,
} from './rentRoll'
import { defaultDueDay, leaseSchema } from './schema'

const row = (over: Partial<Parameters<typeof toRollRow>[0]> = {}): RollRow =>
  toRollRow({
    lease_id: 'l',
    property_id: 'p',
    property_code: 'SHOP-4',
    property_name: null,
    party_id: 't',
    tenant_name: 'Tenant X',
    start_date: '2026-01-01',
    end_date: null,
    ended_on: null,
    monthly_rent: 50000,
    security_deposit: 0,
    rent_due_day: 1,
    status: 'active',
    months_due: 3,
    expected: 150000,
    received: 100000,
    arrears: 50000,
    months_unpaid: 1,
    paid_ahead: 0,
    deposit_held: 0,
    last_rent_date: '2026-02-05',
    last_rent_amount: 50000,
    days_to_end: null,
    rent_counted_from: null,
    ...over,
  })

describe('rent roll', () => {
  it('converts API numbers to Money strings', () => {
    expect(row()).toMatchObject({
      monthly_rent: '50000.00',
      arrears: '50000.00',
      last_rent_amount: '50000.00',
    })
  })

  it('describes the rent position in plain words', () => {
    expect(rentPosition(row(), 'PKR')).toEqual({ label: '1 month unpaid (Rs 50,000)', tone: 'bad' })
    expect(rentPosition(row({ arrears: 150000, months_unpaid: 3 }), 'PKR').label).toBe(
      '3 months unpaid (Rs 150,000)',
    )
    expect(rentPosition(row({ arrears: 0, months_unpaid: 0, paid_ahead: 5000 }), 'PKR')).toEqual({
      label: 'Paid up · Rs 5,000 ahead',
      tone: 'good',
    })
    expect(rentPosition(row({ arrears: 0, months_unpaid: 0 }), 'PKR').label).toBe('Paid up')
  })

  it('filters and totals', () => {
    const rows = [
      row({ lease_id: 'a' }),
      row({ lease_id: 'b', arrears: 0, months_unpaid: 0, end_date: '2026-10-10', days_to_end: 14 }),
      row({ lease_id: 'c', status: 'ended', arrears: 20000 }),
      row({ lease_id: 'd', status: 'upcoming', arrears: 0, months_unpaid: 0 }),
    ]
    const ids = (f: Parameters<typeof filterRoll>[1]) => filterRoll(rows, f).map((r) => r.lease_id)
    expect(ids('current')).toEqual(['a', 'b'])
    expect(ids('owing')).toEqual(['a', 'c'])
    expect(ids('ending')).toEqual(['b'])
    expect(ids('ended')).toEqual(['c'])
    expect(ids('upcoming')).toEqual(['d'])
    expect(rollTotals(rows)).toEqual({
      monthlyRent: '100000.00',
      arrears: '70000.00',
      owingCount: 2,
    })
    expect(parseRollFilter('nonsense')).toBe('current')
  })

  it('labels the end', () => {
    expect(endLabel(row())).toBe('No end date')
    expect(endLabel(row({ end_date: '2026-10-10', days_to_end: 14 }))).toBe(
      'Ends 10/10/2026 (in 14 days)',
    )
    expect(endLabel(row({ status: 'ended', ended_on: '2026-04-30', days_to_end: -10 }))).toBe(
      'Ended 30/04/2026',
    )
  })
})

describe('lease form', () => {
  const base = { property_id: 'p', party_id: 't', start_date: '2026-01-15', monthly_rent: '50,000' }
  it('defaults the due day to the start day (at most 28) and keeps money exact', () => {
    expect(leaseSchema.parse(base)).toMatchObject({
      monthly_rent: '50000.00',
      security_deposit: '0.00',
      rent_due_day: 15,
      end_date: null,
    })
    expect(defaultDueDay('2026-01-31')).toBe(28)
  })
  it('counts rent from an optional date, never before the start', () => {
    expect(leaseSchema.parse(base).rent_counted_from).toBeNull()
    expect(leaseSchema.parse({ ...base, rent_counted_from: '2026-07-01' }).rent_counted_from).toBe('2026-07-01')
    const bad = leaseSchema.safeParse({ ...base, rent_counted_from: '2025-12-01' })
    expect(bad.error?.issues.map((i) => i.path[0])).toEqual(['rent_counted_from'])
  })

  it('rejects an end before the start, a zero rent and a bad due day', () => {
    const paths = (v: Record<string, string>) =>
      leaseSchema.safeParse({ ...base, ...v }).error?.issues.map((i) => i.path[0])
    expect(paths({ end_date: '2026-01-01' })).toEqual(['end_date'])
    expect(paths({ monthly_rent: '0', rent_due_day: '31' })).toEqual([
      'monthly_rent',
      'rent_due_day',
    ])
  })
})
