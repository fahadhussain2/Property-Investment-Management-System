import { describe, expect, it } from 'vitest'
import { toRollRow, type RollRow } from '@/features/leases/rentRoll'
import {
  ASSET_LOOK,
  CASH_LOOK,
  INVESTED_LOOK,
  overdueLook,
  profitLook,
  assetClasses,
  attention,
  axisFor,
  cashAccounts,
  compactTick,
  isQuiet,
  lastMonths,
  monthLabel,
  owed,
  portfolio,
  portfolioLabel,
  profitMix,
  rentOverdue,
  toChartPoints,
  toMonthRow,
  totalInvested,
  type RawMonth,
} from './model'

const month = (start: string, over: Partial<RawMonth> = {}) =>
  toMonthRow({
    month_start: start,
    month_end: start.slice(0, 8) + '28',
    gross_trading_profit: 0,
    rent_income: 0,
    other_income: 0,
    total_income: 0,
    total_expenses: 0,
    net_profit: 0,
    closing_cash: 0,
    ...over,
  })

const lease = (over: Partial<Parameters<typeof toRollRow>[0]> = {}): RollRow =>
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
    received: 150000,
    arrears: 0,
    months_unpaid: 0,
    paid_ahead: 0,
    deposit_held: 0,
    last_rent_date: null,
    last_rent_amount: null,
    days_to_end: null,
    rent_counted_from: null,
    ...over,
  })

describe('monthly chart', () => {
  it('keeps money as strings and adds numbers only for geometry', () => {
    const [p] = toChartPoints([month('2026-09-01', { total_income: 910000, total_expenses: 320000, net_profit: 590000 })])
    expect(p).toMatchObject({ total_income: '910000.00', net_profit: '590000.00', income_y: 910000, expenses_y: 320000, profit_y: 590000 })
    expect(p.label).toBe('Sep')
    expect(p.longLabel).toBe('September 2026')
  })

  it('shows the year on January', () => {
    expect(monthLabel('2026-01-01').label).toBe('Jan 26')
  })

  it('takes the last n months', () => {
    expect(lastMonths([1, 2, 3, 4], 2)).toEqual([3, 4])
    expect(lastMonths([1], 6)).toEqual([1])
  })

  it('is quiet only when every month is zero', () => {
    expect(isQuiet([month('2026-08-01'), month('2026-09-01')])).toBe(true)
    expect(isQuiet([month('2026-08-01'), month('2026-09-01', { total_expenses: 1 })])).toBe(false)
  })

  it('builds a nice axis from zero to above the largest value', () => {
    const axis = axisFor(toChartPoints([month('2026-09-01', { total_income: 3400000, total_expenses: 510000, net_profit: 2890000 })]))
    expect(axis.min).toBe(0)
    expect(axis.max).toBeGreaterThanOrEqual(3400000)
    expect(axis.ticks[0]).toBe(0)
    expect(axis.ticks.at(-1)).toBe(axis.max)
    expect(axis.ticks.length).toBeLessThanOrEqual(6)
  })

  it('extends the axis below zero for a loss month', () => {
    const axis = axisFor(toChartPoints([month('2026-09-01', { total_income: -200000, total_expenses: 50000, net_profit: -250000 })]))
    expect(axis.min).toBeLessThanOrEqual(-250000)
    expect(axis.ticks).toContain(0)
  })

  it('has a safe axis when everything is zero', () => {
    expect(axisFor(toChartPoints([month('2026-09-01')]))).toEqual({ min: 0, max: 1, ticks: [0] })
  })

  it('labels ticks compactly', () => {
    expect(compactTick(0)).toBe('0')
    expect(compactTick(500)).toBe('500')
    expect(compactTick(12000)).toBe('12K')
    expect(compactTick(1500000)).toBe('1.5M')
    expect(compactTick(-250000)).toBe('-250K')
  })
})

describe('needs attention', () => {
  const roll = [
    lease({ lease_id: 'a', party_id: 't1', arrears: 55000, months_unpaid: 1 }),
    lease({ lease_id: 'b', party_id: 't2', arrears: 120000, months_unpaid: 2 }),
    lease({ lease_id: 'c', party_id: 't3', arrears: 0 }),
    lease({ lease_id: 'd', party_id: 't1', arrears: 50000, months_unpaid: 1, status: 'ended' }),
  ]

  it('lists rent overdue largest first, including ended leases', () => {
    const a = attention(roll, [], [])
    expect(a.overdue.rows.map((r) => r.lease_id)).toEqual(['b', 'a', 'd'])
    expect(a.overdue.count).toBe(3)
  })

  it('sums rent overdue and counts tenants once', () => {
    expect(rentOverdue(roll)).toEqual({ total: '225000.00', tenants: 2, months: 4 })
    expect(rentOverdue([])).toEqual({ total: '0.00', tenants: 0, months: 0 })
  })

  it('sorts leases ending soonest first and payables largest first', () => {
    const a = attention(
      [],
      [
        { lease_id: 'x', property_code: 'SH-02', tenant_name: 'Noor', end_date: '2026-11-03', days_to_end: 36 },
        { lease_id: 'y', property_code: 'AP-07', tenant_name: 'Kamran', end_date: '2026-10-12', days_to_end: 14 },
      ],
      [
        { party_id: 'p1', name: 'Small', payable: 100 },
        { party_id: 'p2', name: 'Nothing', payable: 0 },
        { party_id: 'p3', name: 'Large', payable: 2400000 },
      ],
    )
    expect(a.ending.rows.map((r) => r.lease_id)).toEqual(['y', 'x'])
    expect(a.toPay.rows.map((r) => r.name)).toEqual(['Large', 'Small'])
    expect(a.toPay.rows[0].payable).toBe('2400000.00')
    expect(a.defaultTab).toBe('ending')
    expect(a.total).toBe(4)
  })

  it('shows at most five rows but counts all', () => {
    const many = Array.from({ length: 7 }, (_, i) => lease({ lease_id: String(i), arrears: 1000 + i }))
    const a = attention(many, [], [])
    expect(a.overdue.rows).toHaveLength(5)
    expect(a.overdue.count).toBe(7)
  })

  it('opens the first tab with rows, else the first tab', () => {
    expect(attention(roll, [], []).defaultTab).toBe('overdue')
    expect(attention([], [], [{ party_id: 'p', name: 'S', payable: 1 }]).defaultTab).toBe('to_pay')
    expect(attention([], [], []).defaultTab).toBe('overdue')
  })
})

describe('portfolio', () => {
  const p = portfolio([
    { status: 'rented', for_sale: true, cost: 1000 },
    { status: 'rented', for_sale: false, cost: 2000 },
    { status: 'vacant', for_sale: true, cost: 300 },
    { status: 'under_agreement', for_sale: false, cost: 400 },
    { status: 'sold', for_sale: false, cost: 0 },
  ])

  it('splits held properties into exclusive statuses that add up to held', () => {
    expect(p.held).toBe(4)
    expect(p.segments.map((s) => s.count)).toEqual([2, 1, 1])
    expect(p.segments.reduce((n, s) => n + s.count, 0)).toBe(p.held)
  })

  it('counts "for sale" as a flag outside the bar, and sold separately', () => {
    expect(p.forSale).toBe(2)
    expect(p.sold).toBe(1)
    expect(p.heldCost).toBe('3700.00')
  })

  it('describes the bar for screen readers', () => {
    expect(portfolioLabel(p)).toBe('4 held: 2 rented, 1 vacant, 1 under agreement')
  })
})

describe('what we own', () => {
  const assets = assetClasses([
    { class: 'silver', items: 1, weight_g: 583.19019, cost: 120000.1, market_value: null },
    { class: 'gold', items: 2, weight_g: 116.638038, cost: 2500000.2, market_value: 2780000 },
  ])

  it('returns vehicle, gold and silver in order; a missing class counts as none held', () => {
    expect(assets.map((a) => a.class)).toEqual(['vehicle', 'gold', 'silver'])
    expect(assets[0]).toEqual({ class: 'vehicle', items: 0, cost: '0.00', weight_g: '0', market_value: null })
  })

  it('converts API numbers to decimal strings and keeps "no rate yet" as null', () => {
    expect(assets[1]).toMatchObject({ items: 2, cost: '2500000.20', weight_g: '116.638038', market_value: '2780000.00' })
    expect(assets[2].market_value).toBeNull()
  })

  it('totals properties and holdings at cost, exactly', () => {
    expect(totalInvested(portfolio([{ status: 'vacant', for_sale: false, cost: 0.1 }]), assets)).toEqual({
      total: '2620000.40',
      count: 4,
    })
  })
})

describe('profit mix', () => {
  it('scales every bar to the largest amount and draws expenses as expense', () => {
    const rows = profitMix({ gross_trading_profit: '1420000.00', rent_income: '2340000.00', other_income: '170000.00', total_expenses: '1040000.00' })
    expect(rows.map((r) => r.pct)).toEqual([60.68, 100, 7.26, 44.44])
    expect(rows.map((r) => r.tone)).toEqual(['income', 'income', 'income', 'expense'])
  })

  it('draws a trading loss like an expense', () => {
    const [trading] = profitMix({ gross_trading_profit: '-500.00', rent_income: '1000.00', other_income: '0.00', total_expenses: '0.00' })
    expect(trading).toMatchObject({ negative: true, tone: 'expense', pct: 50 })
  })

  it('has zero-width bars when there is nothing yet', () => {
    const rows = profitMix({ gross_trading_profit: '0.00', rent_income: '0.00', other_income: '0.00', total_expenses: '0.00' })
    expect(rows.every((r) => r.pct === 0)).toBe(true)
  })
})

describe('cash by account', () => {
  const balances = [
    { account_id: '1', code: '1000', name: 'Cash in Hand', subtype: 'cash', system_key: 'cash', balance: 412500 },
    { account_id: '2', code: '1101', name: 'Meezan', subtype: 'bank', system_key: null, balance: 5630000 },
    { account_id: '3', code: '1102', name: 'HBL', subtype: 'bank', system_key: null, balance: -1000 },
    { account_id: '4', code: '1300', name: 'Receivable from Buyers', subtype: 'receivable', system_key: 'receivable_buyers', balance: 1850000 },
    { account_id: '5', code: '2000', name: 'Payable to Sellers', subtype: 'payable', system_key: 'payable_sellers', balance: 2400000 },
    { account_id: '6', code: '2100', name: 'Advances', subtype: 'advance', system_key: 'advances_buyers', balance: 420000 },
    { account_id: '7', code: '2200', name: 'Deposits', subtype: 'deposit', system_key: 'deposits_held', balance: 300000 },
  ]

  it('lists only cash and bank accounts, largest first, with the total', () => {
    const c = cashAccounts(balances)
    expect(c.rows.map((r) => r.code)).toEqual(['1101', '1000', '1102'])
    expect(c.total).toBe('6041500.00')
    expect(c.hasBank).toBe(true)
  })

  it('draws no bar for a negative balance', () => {
    const c = cashAccounts(balances)
    expect(c.rows[0].pct).toBe(100)
    expect(c.rows[2]).toMatchObject({ negative: true, pct: 0 })
  })

  it('knows when no bank account exists yet', () => {
    expect(cashAccounts(balances.slice(0, 1)).hasBank).toBe(false)
  })

  it('works out who owes whom from the system accounts', () => {
    expect(owed(balances)).toEqual({
      owedToUs: '1850000.00',
      weOwe: '3120000.00',
      sellers: '2400000.00',
      tokens: '420000.00',
      deposits: '300000.00',
    })
  })
})

describe('tile looks (spec 005 §3)', () => {
  it('colours only what means something', () => {
    expect(CASH_LOOK).toEqual({ icon: 'wallet', tone: 'blue' })
    expect(INVESTED_LOOK).toEqual({ icon: 'landmark', tone: 'blue' })
    expect(ASSET_LOOK.gold.tone).toBe('amber')
    expect([ASSET_LOOK.property, ASSET_LOOK.vehicle, ASSET_LOOK.silver].map((l) => l.tone)).toEqual(['neutral', 'neutral', 'neutral'])
  })

  it('net profit: green up for a profit or zero, neutral down for a loss, neutral while unknown', () => {
    expect(profitLook('550000.00')).toEqual({ icon: 'trending-up', tone: 'green' })
    expect(profitLook('0.00')).toEqual({ icon: 'trending-up', tone: 'green' })
    expect(profitLook('-0.01')).toEqual({ icon: 'trending-down', tone: 'neutral' })
    expect(profitLook(undefined)).toEqual({ icon: 'trending-up', tone: 'neutral' })
  })

  it('rent overdue: always red, the warning icon only when some is overdue', () => {
    expect(overdueLook('150000.00')).toEqual({ icon: 'alert', tone: 'red' })
    expect(overdueLook('0.00')).toEqual({ icon: 'calendar-clock', tone: 'red' })
    expect(overdueLook(undefined)).toEqual({ icon: 'calendar-clock', tone: 'red' })
  })
})
