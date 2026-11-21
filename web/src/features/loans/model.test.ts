import { describe, expect, it } from 'vitest'
import { splitLoans, toLoanRow, toStatementRows, totalOwed } from './model'

const row = (over: Record<string, unknown> = {}) =>
  toLoanRow({ party_id: 'p1', name: 'Ali', borrowed: 500000, repaid: 200000, owed: 300000, last_date: '2026-02-01', ...over })

describe('loan rows', () => {
  it('turns API numbers into money strings', () => {
    expect(row()).toMatchObject({ borrowed: '500000.00', repaid: '200000.00', owed: '300000.00' })
  })

  it('splits open lenders, settled lenders and the amount with no lender', () => {
    const rows = [
      row(),
      row({ party_id: 'p2', name: 'Bilal', borrowed: 100000, repaid: 100000, owed: 0 }),
      row({ party_id: null, name: 'Not assigned to a lender', borrowed: 10000, repaid: 0, owed: 10000 }),
    ]
    const s = splitLoans(rows)
    expect(s.open.map((r) => r.name)).toEqual(['Ali'])
    expect(s.settled.map((r) => r.name)).toEqual(['Bilal'])
    expect(s.unassigned?.owed).toBe('10000.00')
  })

  it('adds money exactly, with no floating point drift', () => {
    expect(totalOwed([row({ owed: '0.10' }), row({ owed: '0.20' })])).toBe('0.30')
  })

  it('shows 0.00 for nothing owed, never a made-up figure', () => {
    expect(totalOwed([])).toBe('0.00')
  })
})

describe('statement rows', () => {
  it('starts with an opening line of 0 and keeps each line’s balance', () => {
    const rows = toStatementRows([
      { seq: 1, entry_date: '2026-01-02', voucher_id: 'v1', voucher_number: 'LNR-0001', voucher_type: 'loan_received', memo: null, debit: 0, credit: 500000, balance: 500000 },
      { seq: 2, entry_date: '2026-02-01', voucher_id: 'v2', voucher_number: 'LNP-0001', voucher_type: 'loan_repayment', memo: null, debit: 200000, credit: 0, balance: 300000 },
    ])
    expect(rows.map((r) => r.seq)).toEqual([0, 1, 2])
    expect(rows[0].balance).toBe(0)
    expect(rows[2].balance).toBe(300000)
  })
})
