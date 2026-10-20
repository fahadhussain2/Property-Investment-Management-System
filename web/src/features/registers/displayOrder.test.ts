import { describe, expect, it } from 'vitest'
import { displayOrder, toLedgerLine } from './model'

const line = (id: string, date: string, balance: number) =>
  toLedgerLine({
    entry_id: id, entry_date: date, description: id, direction: 'out', amount: 100, running_balance: balance,
    voided_at: null, voided_by: null, void_reason: null, replaced_by_id: null, replaces_id: null,
  })

// Product owner, 2026-10-21: newest first on screen; a printout keeps the register's own order (oldest first).
describe('displayOrder', () => {
  const lines = [line('a', '2026-01-01', 900), line('b', '2026-02-01', 800), line('c', '2026-03-01', 700)]

  it('puts the newest line first on screen, each keeping its own running balance', () => {
    expect(displayOrder(lines, false).map((l) => [l.id, l.balance])).toEqual([['c', '700.00'], ['b', '800.00'], ['a', '900.00']])
  })

  it('keeps the oldest first for printing, and never reorders the lines it was given', () => {
    expect(displayOrder(lines, true).map((l) => l.id)).toEqual(['a', 'b', 'c'])
    displayOrder(lines, false)
    expect(lines.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })
})
