// Pure dashboard logic (spec 002). No lib/supabase import, so unit tests need no environment.
// Money stays a decimal string everywhere; plain numbers exist only in *_y / pct fields for geometry.
import type { RollRow } from '@/features/leases/rentRoll'
import { compare, isNegative, isZero, sharePct, sum, toChartNumber, toMoney, type Money } from '@/lib/money'
import { toGrams, type Grams } from '@/lib/quantity'

// ---------------------------------------------------------------------------------------------
// Income, expenses and profit chart
// ---------------------------------------------------------------------------------------------

type Num = number | string
export type RawMonth = {
  month_start: string
  month_end: string
  gross_trading_profit: Num
  rent_income: Num
  other_income: Num
  total_income: Num
  total_expenses: Num
  net_profit: Num
  closing_cash: Num
}

export type MonthRow = {
  month_start: string
  month_end: string
  gross_trading_profit: Money
  rent_income: Money
  other_income: Money
  total_income: Money
  total_expenses: Money
  net_profit: Money
  closing_cash: Money
}

export type ChartPoint = MonthRow & {
  /** Axis label: "Sep", or "Jan 26" for January so the year is always readable. */
  label: string
  /** Full month name for the tooltip and table, e.g. "September 2026". */
  longLabel: string
  income_y: number
  expenses_y: number
  profit_y: number
}

/** API numerics arrive as JSON numbers: convert at the edge. */
export const toMonthRow = (r: RawMonth): MonthRow => ({
  month_start: r.month_start,
  month_end: r.month_end,
  gross_trading_profit: toMoney(r.gross_trading_profit),
  rent_income: toMoney(r.rent_income),
  other_income: toMoney(r.other_income),
  total_income: toMoney(r.total_income),
  total_expenses: toMoney(r.total_expenses),
  net_profit: toMoney(r.net_profit),
  closing_cash: toMoney(r.closing_cash),
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function monthLabel(monthStart: string): { label: string; longLabel: string } {
  const [y, m] = monthStart.split('-').map(Number)
  return {
    label: m === 1 ? `Jan ${String(y).slice(2)}` : MONTHS[m - 1],
    longLabel: `${LONG_MONTHS[m - 1]} ${y}`,
  }
}

export function toChartPoints(rows: MonthRow[]): ChartPoint[] {
  return rows.map((r) => ({
    ...r,
    ...monthLabel(r.month_start),
    income_y: toChartNumber(r.total_income),
    expenses_y: toChartNumber(r.total_expenses),
    profit_y: toChartNumber(r.net_profit),
  }))
}

/** The last `n` months (rows arrive oldest first). */
export const lastMonths = <T>(rows: T[], n: number): T[] => rows.slice(Math.max(rows.length - n, 0))

export const isQuiet = (rows: MonthRow[]) =>
  rows.every((r) => isZero(r.total_income) && isZero(r.total_expenses) && isZero(r.net_profit))

export type Axis = { min: number; max: number; ticks: number[] }

/** A "nice" y-axis over every plotted value, always including zero (negative months extend it down). */
export function axisFor(points: ChartPoint[], tickCount = 4): Axis {
  const values = points.flatMap((p) => [p.income_y, p.expenses_y, p.profit_y])
  const hi = Math.max(0, ...values)
  const lo = Math.min(0, ...values)
  if (hi === lo) return { min: 0, max: 1, ticks: [0] }
  const rough = (hi - lo) / tickCount
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= rough)!
  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toFixed(2)))
  return { min, max, ticks }
}

/** Compact axis tick: 0, 500, 12K, 1.5M, -250K. Axis labels only; figures users read are full amounts. */
export function compactTick(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const trim = (x: number) => String(Number(x.toFixed(1)))
  if (a >= 1_000_000_000) return `${sign}${trim(a / 1_000_000_000)}B`
  if (a >= 1_000_000) return `${sign}${trim(a / 1_000_000)}M`
  if (a >= 1_000) return `${sign}${trim(a / 1_000)}K`
  return `${sign}${trim(a)}`
}

// ---------------------------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------------------------

export type ExpiringLease = {
  lease_id: string
  property_code: string
  /** Spec 006: the unit, or null/absent for a whole-property lease. */
  unit_name?: string | null
  tenant_name: string
  end_date: string
  days_to_end: number
}

export type RawPartyBalance = { party_id: string; name: string; payable: Num }
export type Payable = { party_id: string; name: string; payable: Money }

export type AttentionTab = 'overdue' | 'ending' | 'to_pay'
export const ATTENTION_LIMIT = 5

export type Attention = {
  overdue: { rows: RollRow[]; count: number }
  ending: { rows: ExpiringLease[]; count: number }
  toPay: { rows: Payable[]; count: number }
  total: number
  /** The first tab with anything in it (in display order), else "overdue". */
  defaultTab: AttentionTab
}

export function attention(roll: RollRow[], expiring: ExpiringLease[], parties: RawPartyBalance[]): Attention {
  const overdue = roll.filter((r) => compare(r.arrears, '0.00') > 0).sort((a, b) => compare(b.arrears, a.arrears))
  const ending = [...expiring].sort((a, b) => a.days_to_end - b.days_to_end)
  const toPay = parties
    .map((p) => ({ party_id: p.party_id, name: p.name, payable: toMoney(p.payable) }))
    .filter((p) => compare(p.payable, '0.00') > 0)
    .sort((a, b) => compare(b.payable, a.payable))
  const defaultTab: AttentionTab = overdue.length ? 'overdue' : ending.length ? 'ending' : toPay.length ? 'to_pay' : 'overdue'
  return {
    overdue: { rows: overdue.slice(0, ATTENTION_LIMIT), count: overdue.length },
    ending: { rows: ending.slice(0, ATTENTION_LIMIT), count: ending.length },
    toPay: { rows: toPay.slice(0, ATTENTION_LIMIT), count: toPay.length },
    total: overdue.length + ending.length + toPay.length,
    defaultTab,
  }
}

/** Headline "Rent overdue": every lease with arrears, ended ones included (that rent is still owed). */
export function rentOverdue(roll: RollRow[]): { total: Money; tenants: number; months: number } {
  const owing = roll.filter((r) => compare(r.arrears, '0.00') > 0)
  return {
    total: sum(owing.map((r) => r.arrears)),
    tenants: new Set(owing.map((r) => r.party_id)).size,
    months: owing.reduce((n, r) => n + r.months_unpaid, 0),
  }
}

export function daysLabel(days: number): string {
  return days === 0 ? 'today' : `in ${days} ${days === 1 ? 'day' : 'days'}`
}

// ---------------------------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------------------------

export type PortfolioProperty = { status: string; for_sale: boolean; cost: Num }

/** Exclusive statuses of properties still held. "For sale" is a flag (spec 001 §3), so it is not a segment. */
export const SEGMENTS = [
  { key: 'rented', label: 'Rented', color: 'var(--chart-status-rented)' },
  { key: 'vacant', label: 'Vacant', color: 'var(--chart-status-vacant)' },
  { key: 'under_agreement', label: 'Under agreement', color: 'var(--chart-status-agreement)' },
] as const

export type Portfolio = {
  held: number
  sold: number
  forSale: number
  heldCost: Money
  segments: { key: (typeof SEGMENTS)[number]['key']; label: string; color: string; count: number }[]
}

export function portfolio(props: PortfolioProperty[]): Portfolio {
  const held = props.filter((p) => p.status !== 'sold')
  return {
    held: held.length,
    sold: props.length - held.length,
    forSale: held.filter((p) => p.for_sale).length,
    heldCost: sum(held.map((p) => toMoney(p.cost))),
    segments: SEGMENTS.map((s) => ({ ...s, count: held.filter((p) => p.status === s.key).length })),
  }
}

export const portfolioLabel = (p: Portfolio) =>
  `${p.held} held: ` + p.segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(', ')

// ---------------------------------------------------------------------------------------------
// What we own: vehicles, gold and silver (holdings_valuation), and the total invested at cost
// ---------------------------------------------------------------------------------------------

export const ASSET_CLASSES = ['vehicle', 'gold', 'silver'] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

export type RawValuation = { class: string; items: number; weight_g: Num | null; cost: Num | null; market_value: Num | null }
/** market_value is null for vehicles, and for a metal that has no rate yet. */
export type AssetTotals = { class: AssetClass; items: number; cost: Money; weight_g: Grams; market_value: Money | null }

/** One row per class in a fixed order; a class missing from the rows counts as none held. */
export function assetClasses(rows: RawValuation[]): AssetTotals[] {
  return ASSET_CLASSES.map((c) => {
    const r = rows.find((x) => x.class === c)
    return {
      class: c,
      items: r?.items ?? 0,
      cost: toMoney(r?.cost),
      weight_g: toGrams(r?.weight_g),
      market_value: r?.market_value == null ? null : toMoney(r.market_value),
    }
  })
}

/** Properties held plus vehicles, gold and silver, all at cost (the books never hold market value). */
export function totalInvested(p: Portfolio, assets: AssetTotals[]): { total: Money; count: number } {
  return {
    total: sum([p.heldCost, ...assets.map((a) => a.cost)]),
    count: p.held + assets.reduce((n, a) => n + a.items, 0),
  }
}

// ---------------------------------------------------------------------------------------------
// Where this year's profit came from
// ---------------------------------------------------------------------------------------------

export type ProfitSource = {
  gross_trading_profit: Money
  rent_income: Money
  other_income: Money
  total_expenses: Money
}

export type MixRow = { key: string; label: string; amount: Money; pct: number; tone: 'income' | 'expense'; negative: boolean }

export function profitMix(is: ProfitSource): MixRow[] {
  const rows = [
    { key: 'trading', label: 'Profit on properties sold', amount: is.gross_trading_profit, expense: false },
    { key: 'rent', label: 'Rent', amount: is.rent_income, expense: false },
    { key: 'other', label: 'Other income', amount: is.other_income, expense: false },
    { key: 'expenses', label: 'Expenses', amount: is.total_expenses, expense: true },
  ]
  const largest = rows.map((r) => r.amount.replace('-', '')).reduce((m, a) => (compare(a, m) > 0 ? a : m), '0.00')
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    amount: r.amount,
    pct: sharePct(r.amount, largest),
    negative: isNegative(r.amount),
    // A loss on property trading is drawn like an expense.
    tone: r.expense || isNegative(r.amount) ? 'expense' : 'income',
  }))
}

// ---------------------------------------------------------------------------------------------
// Cash by account
// ---------------------------------------------------------------------------------------------

export type RawBalance = { account_id: string; code: string; name: string; subtype: string; system_key: string | null; balance: Num }
export type CashAccount = { account_id: string; code: string; name: string; kind: 'Bank' | 'Cash'; balance: Money; pct: number; negative: boolean }

export function cashAccounts(balances: RawBalance[]): { rows: CashAccount[]; total: Money; hasBank: boolean } {
  const money = balances
    .filter((a) => a.subtype === 'cash' || a.subtype === 'bank')
    .map((a) => ({ ...a, balance: toMoney(a.balance) }))
    .sort((a, b) => compare(b.balance, a.balance))
  const largest = money.length && compare(money[0].balance, '0.00') > 0 ? money[0].balance : '0.00'
  return {
    rows: money.map((a) => ({
      account_id: a.account_id,
      code: a.code,
      name: a.name,
      kind: a.subtype === 'bank' ? 'Bank' : 'Cash',
      balance: a.balance,
      negative: isNegative(a.balance),
      pct: isNegative(a.balance) ? 0 : sharePct(a.balance, largest),
    })),
    total: sum(money.map((a) => a.balance)),
    hasBank: money.some((a) => a.subtype === 'bank'),
  }
}

/**
 * The Cash & bank tile: the total, and its cash and bank parts for the glance line under it (005 amendment 3).
 * A kind with no account is left out, so a business without a bank account sees only "Cash".
 */
export function cashSplit(c: { rows: CashAccount[]; total: Money }): { total: Money; parts: { kind: CashAccount['kind']; amount: Money }[] } {
  const kinds: CashAccount['kind'][] = ['Cash', 'Bank']
  return {
    total: c.total,
    parts: kinds
      .filter((kind) => c.rows.some((r) => r.kind === kind))
      .map((kind) => ({ kind, amount: sum(c.rows.filter((r) => r.kind === kind).map((r) => r.balance)) })),
  }
}

/** Who owes whom, from the system accounts (same figures as before spec 002). */
export function owed(balances: RawBalance[]) {
  const bal = (key: string) => toMoney(balances.find((a) => a.system_key === key)?.balance)
  const sellers = bal('payable_sellers')
  const tokens = bal('advances_buyers')
  const deposits = bal('deposits_held')
  return { owedToUs: bal('receivable_buyers'), weOwe: sum([sellers, tokens, deposits]), sellers, tokens, deposits }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** The parts of a query a block needs; derived views (e.g. totals from balances) keep the same state. */
export type QueryLike<T> = { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown }

export const mapQuery = <T, U>(q: QueryLike<T>, f: (d: T) => U): QueryLike<U> => ({
  isPending: q.isPending,
  isError: q.isError,
  error: q.error,
  refetch: q.refetch,
  data: q.data === undefined ? undefined : f(q.data),
})


// ---------------------------------------------------------------------------------------------
// Tile icons and tones (spec 005 §3). Names, not components, so this file stays free of React.
// ---------------------------------------------------------------------------------------------

export type TileTone = 'blue' | 'green' | 'amber' | 'red' | 'neutral'
export type TileIcon = 'wallet' | 'trending-up' | 'trending-down' | 'landmark' | 'calendar-clock' | 'alert' | 'building' | 'car' | 'gem' | 'coins'
export type TileLook = { icon: TileIcon; tone: TileTone }

export const CASH_LOOK: TileLook = { icon: 'wallet', tone: 'blue' }
export const INVESTED_LOOK: TileLook = { icon: 'landmark', tone: 'blue' }

/** Green only for a profit; a loss gets a neutral, downward icon (its figure is already red). Unknown while loading. */
export const profitLook = (net: Money | undefined): TileLook =>
  net === undefined ? { icon: 'trending-up', tone: 'neutral' } : isNegative(net) ? { icon: 'trending-down', tone: 'neutral' } : { icon: 'trending-up', tone: 'green' }

/** Always red; the warning icon (and the tile's red ring) only when rent is overdue, so the alert never relies on colour alone. */
export const overdueLook = (total: Money | undefined): TileLook =>
  total === undefined || isZero(total) ? { icon: 'calendar-clock', tone: 'red' } : { icon: 'alert', tone: 'red' }

export const ASSET_LOOK: Record<'property' | AssetClass, TileLook> = {
  property: { icon: 'building', tone: 'neutral' },
  vehicle: { icon: 'car', tone: 'neutral' },
  gold: { icon: 'gem', tone: 'amber' },
  silver: { icon: 'coins', tone: 'neutral' },
}
