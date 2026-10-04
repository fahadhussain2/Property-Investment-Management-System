import { describe, expect, it } from 'vitest'
import { cashAccounts, cashByKind, cashTrend, toCashMonth, type RawBalance } from './model'

const acct = (code: string, subtype: string, balance: number): RawBalance => ({
  account_id: code,
  code,
  name: code,
  subtype,
  system_key: null,
  balance,
})

// 005 amendment 4: separate Cash and Bank tiles, each with its total, account count and trend line.
describe('cashByKind', () => {
  it('adds up cash and bank separately and counts their accounts', () => {
    expect(cashByKind(cashAccounts([acct('1000', 'cash', 550000), acct('1101', 'bank', 11000000), acct('1102', 'bank', 325000)]))).toEqual({
      Cash: { total: '550000.00', count: 1 },
      Bank: { total: '11325000.00', count: 2 },
    })
  })

  it('gives a kind with no account zero from zero accounts, and ignores other accounts', () => {
    expect(cashByKind(cashAccounts([acct('1000', 'cash', 45000), acct('1300', 'receivable', 900000)]))).toEqual({
      Cash: { total: '45000.00', count: 1 },
      Bank: { total: '0.00', count: 0 },
    })
    expect(cashByKind(cashAccounts([]))).toEqual({ Cash: { total: '0.00', count: 0 }, Bank: { total: '0.00', count: 0 } })
  })

  it('keeps an overdrawn bank negative', () => {
    expect(cashByKind(cashAccounts([acct('1101', 'bank', 300000), acct('1102', 'bank', -550000)])).Bank).toEqual({ total: '-250000.00', count: 2 })
  })
})

describe('cashTrend', () => {
  const months = [1, 2, 3, 4, 5, 6, 7].map((n) => toCashMonth({ closing_cash_in_hand: n * 100, closing_bank: `${n * 1000}.50` }))

  it('takes the last six month ends of the kind, oldest first, as decimal strings', () => {
    expect(cashTrend(months, 'Cash')).toEqual(['200.00', '300.00', '400.00', '500.00', '600.00', '700.00'])
    expect(cashTrend(months, 'Bank')).toEqual(['2000.50', '3000.50', '4000.50', '5000.50', '6000.50', '7000.50'])
  })

  it('returns what there is when fewer than six months are available', () => {
    expect(cashTrend(months.slice(0, 2), 'Cash')).toEqual(['100.00', '200.00'])
  })
})
