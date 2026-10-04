import { describe, expect, it } from 'vitest'
import { moneyAccounts, moneyKindOf } from './filter'

const acct = (name: string, subtype: string, balance = '100.00', is_active = true) => ({ name, subtype, balance, is_active })
const accounts = [
  acct('Cash in Hand', 'cash'),
  acct('Meezan', 'bank'),
  acct('HBL', 'bank'),
  acct('Old till', 'cash', '0.00', false),
  acct('Receivable', 'receivable'),
]
const names = (kind: Parameters<typeof moneyAccounts>[1]) => moneyAccounts(accounts, kind).map((a) => a.name)

// The dashboard's Cash and Bank tiles open the Cash & Bank page on their own kind.
describe('moneyAccounts', () => {
  it('lists cash and bank accounts, or one kind', () => {
    expect(names('all')).toEqual(['Cash in Hand', 'Meezan', 'HBL'])
    expect(names('cash')).toEqual(['Cash in Hand'])
    expect(names('bank')).toEqual(['Meezan', 'HBL'])
  })

  it('shows a hidden account only while it holds money', () => {
    expect(moneyAccounts([acct('Old till', 'cash', '5.00', false)], 'cash')).toHaveLength(1)
    expect(moneyAccounts([acct('Old till', 'cash', '0.00', false)], 'cash')).toHaveLength(0)
  })
})

describe('moneyKindOf', () => {
  it('reads cash or bank from the URL; anything else means all', () => {
    expect(moneyKindOf('cash')).toBe('cash')
    expect(moneyKindOf('bank')).toBe('bank')
    expect(moneyKindOf(null)).toBe('all')
    expect(moneyKindOf('gold')).toBe('all')
  })
})
