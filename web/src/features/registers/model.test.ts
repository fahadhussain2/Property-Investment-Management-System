import { describe, expect, it } from 'vitest'
import { registerCsv, toLedgerLine, toRegisterRow, voidedNote } from './model'
import { entrySchema, registerSchema } from './schema'

const raw = (over: Record<string, unknown> = {}) => ({
  entry_id: 'e1',
  entry_date: '2026-01-02',
  description: 'Zakat received',
  direction: 'in',
  amount: 1000000,
  running_balance: 1053650,
  voided_at: null,
  voided_by: null,
  void_reason: null,
  replaced_by_id: null,
  replaces_id: null,
  ...over,
})
const line = (over: Record<string, unknown> = {}) => toLedgerLine(raw(over) as Parameters<typeof toLedgerLine>[0])

// Spec 007: a register is a memo ledger; its lines and states come from the database, money as exact strings.
describe('toRegisterRow / toLedgerLine', () => {
  it('turns API numbers into exact money strings', () => {
    const r = toRegisterRow({
      id: 'r1', name: 'Zakat Fund', opening_balance: 53650, opening_date: null, is_active: true,
      total_in: 1000000, total_out: 24000, balance: 1029650, entry_count: 3, last_entry_date: '2026-01-04',
    })
    expect([r.opening_balance, r.total_in, r.total_out, r.balance]).toEqual(['53650.00', '1000000.00', '24000.00', '1029650.00'])
    expect(line()).toMatchObject({ amount: '1000000.00', balance: '1053650.00', direction: 'in' })
  })

  it('derives the state: live, corrected (voided with a replacement) or voided', () => {
    expect(line().state).toBeNull()
    expect(line({ voided_at: '2026-01-05T10:00:00Z', replaced_by_id: 'e2' }).state).toBe('corrected')
    expect(line({ voided_at: '2026-01-05T10:00:00Z' }).state).toBe('voided')
  })
})

describe('voidedNote', () => {
  const voided = line({ voided_at: '2026-01-05T10:00:00Z', void_reason: 'wrong amount', replaced_by_id: 'e2' })
  it('says what happened, when, by whom and why', () => {
    expect(voidedNote(voided, 'ali@x.com')).toBe('Corrected 05/01/2026 by ali@x.com: wrong amount')
    expect(voidedNote(line({ voided_at: '2026-01-05T10:00:00Z' }), null)).toBe('Voided 05/01/2026 by a former member')
  })
  it('leaves the name out when the member list is not available', () => {
    expect(voidedNote(voided, undefined)).toBe('Corrected 05/01/2026: wrong amount')
  })
  it('is empty for a live line', () => {
    expect(voidedNote(line(), 'ali@x.com')).toBe('')
  })
})

describe('registerCsv', () => {
  it('starts with the opening balance and keeps voided lines with their status, ISO dates and exact amounts', () => {
    const reg = toRegisterRow({
      id: 'r1', name: 'Zakat Fund', opening_balance: 53650, opening_date: '2025-03-30', is_active: true,
      total_in: 0, total_out: 0, balance: 0, entry_count: 0, last_entry_date: null,
    })
    const csv = registerCsv(reg, [
      line(),
      line({ entry_id: 'e2', description: 'Amjad', direction: 'out', amount: 23500, running_balance: 1030150, voided_at: '2026-01-05T10:00:00Z', void_reason: 'typo' }),
    ])
    expect(csv.headers).toEqual(['Date', 'Description', 'In', 'Out', 'Balance', 'Status', 'Reason'])
    expect(csv.rows).toEqual([
      ['2025-03-30', 'Opening balance', null, null, '53650.00', null, null],
      ['2026-01-02', 'Zakat received', '1000000.00', null, '1053650.00', 'Live', null],
      ['2026-01-02', 'Amjad', null, '23500.00', '1030150.00', 'Voided', 'typo'],
    ])
  })
})

describe('schemas', () => {
  it('a register: a name, and an opening balance that may be empty or negative', () => {
    expect(registerSchema.parse({ name: ' Zakat Fund ', opening_balance: '', opening_date: '' })).toEqual({
      name: 'Zakat Fund', opening_balance: '0.00', opening_date: null,
    })
    expect(registerSchema.parse({ name: 'X', opening_balance: '-1,500.5', opening_date: '2025-03-30' }).opening_balance).toBe('-1500.50')
    expect(registerSchema.safeParse({ name: '  ', opening_balance: '' }).success).toBe(false)
    expect(registerSchema.safeParse({ name: 'X', opening_balance: 'abc' }).success).toBe(false)
  })

  it('an entry: description, direction and an amount above zero with at most two decimals', () => {
    const ok = { entry_date: '2026-01-02', description: ' Saleem ', direction: 'out', amount: '25,000' }
    expect(entrySchema.parse(ok)).toMatchObject({ description: 'Saleem', amount: '25000.00', reason: null })
    for (const bad of [{ amount: '0' }, { amount: '-5' }, { amount: '1.234' }, { amount: '' }, { description: ' ' }, { direction: 'sideways' }, { description: 'x'.repeat(201) }]) {
      expect(entrySchema.safeParse({ ...ok, ...bad }).success, JSON.stringify(bad)).toBe(false)
    }
  })
})
