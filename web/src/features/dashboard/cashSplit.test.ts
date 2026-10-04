import { describe, expect, it } from 'vitest'
import { cashAccounts, cashSplit, type RawBalance } from './model'

const acct = (code: string, subtype: string, balance: number): RawBalance => ({
  account_id: code,
  code,
  name: code,
  subtype,
  system_key: null,
  balance,
})

// 005 amendment 3: the Cash & bank tile's split line.
describe('cashSplit', () => {
  it('adds up cash and bank separately, cash first', () => {
    const s = cashSplit(cashAccounts([acct('1000', 'cash', 550000), acct('1101', 'bank', 11000000), acct('1102', 'bank', 325000)]))
    expect(s.total).toBe('11875000.00')
    expect(s.parts).toEqual([
      { kind: 'Cash', amount: '550000.00' },
      { kind: 'Bank', amount: '11325000.00' },
    ])
  })

  it('leaves out a kind with no account, and ignores other accounts', () => {
    expect(cashSplit(cashAccounts([acct('1000', 'cash', 45000), acct('1300', 'receivable', 900000)])).parts).toEqual([
      { kind: 'Cash', amount: '45000.00' },
    ])
    expect(cashSplit(cashAccounts([])).parts).toEqual([])
  })

  it('keeps an overdrawn bank negative', () => {
    expect(cashSplit(cashAccounts([acct('1101', 'bank', 300000), acct('1102', 'bank', -550000)])).parts).toEqual([
      { kind: 'Bank', amount: '-250000.00' },
    ])
  })
})
