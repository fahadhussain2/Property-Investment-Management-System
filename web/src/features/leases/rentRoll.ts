import { compare, formatMoney, sum, toMoney, type Money } from '@/lib/money'

/** One rent roll row with money already converted to Money strings (see toRollRow). */
export type RollRow = {
  lease_id: string
  property_id: string
  property_code: string
  property_name: string | null
  party_id: string
  tenant_name: string
  start_date: string
  end_date: string | null
  ended_on: string | null
  monthly_rent: Money
  security_deposit: Money
  rent_due_day: number
  status: 'active' | 'upcoming' | 'ended'
  months_due: number
  expected: Money
  received: Money
  arrears: Money
  months_unpaid: number
  paid_ahead: Money
  deposit_held: Money
  last_rent_date: string | null
  last_rent_amount: Money | null
  days_to_end: number | null
  rent_counted_from: string | null
}

type Raw = Omit<
  RollRow,
  | 'monthly_rent'
  | 'security_deposit'
  | 'expected'
  | 'received'
  | 'arrears'
  | 'paid_ahead'
  | 'deposit_held'
  | 'last_rent_amount'
  | 'status'
> & {
  status: string
  monthly_rent: number | string
  security_deposit: number | string
  expected: number | string
  received: number | string
  arrears: number | string
  paid_ahead: number | string
  deposit_held: number | string
  last_rent_amount: number | string | null
}

/** API numerics arrive as JSON numbers: convert at the edge. */
export const toRollRow = (r: Raw): RollRow => ({
  ...r,
  status: r.status as RollRow['status'],
  monthly_rent: toMoney(r.monthly_rent),
  security_deposit: toMoney(r.security_deposit),
  expected: toMoney(r.expected),
  received: toMoney(r.received),
  arrears: toMoney(r.arrears),
  paid_ahead: toMoney(r.paid_ahead),
  deposit_held: toMoney(r.deposit_held),
  last_rent_amount: r.last_rent_amount == null ? null : toMoney(r.last_rent_amount),
})

export const EXPIRING_DAYS = 60

export const ROLL_FILTERS = [
  { value: 'current', label: 'Current' },
  { value: 'owing', label: 'Rent due' },
  { value: 'ending', label: 'Ending soon' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ended', label: 'Ended' },
  { value: 'all', label: 'All' },
] as const
export type RollFilter = (typeof ROLL_FILTERS)[number]['value']

export const parseRollFilter = (v: string | null): RollFilter =>
  ROLL_FILTERS.some((f) => f.value === v) ? (v as RollFilter) : 'current'

const owes = (r: RollRow) => compare(r.arrears, '0.00') > 0

export function filterRoll(rows: RollRow[], f: RollFilter): RollRow[] {
  switch (f) {
    case 'current':
      return rows.filter((r) => r.status === 'active')
    case 'owing':
      return rows.filter(owes)
    case 'ending':
      return rows.filter(
        (r) => r.status === 'active' && r.days_to_end !== null && r.days_to_end <= EXPIRING_DAYS,
      )
    case 'upcoming':
    case 'ended':
      return rows.filter((r) => r.status === f)
    case 'all':
      return rows
  }
}

/** Rent per month of current leases, and all unpaid rent (current and ended leases). */
export function rollTotals(rows: RollRow[]) {
  return {
    monthlyRent: sum(rows.filter((r) => r.status === 'active').map((r) => r.monthly_rent)),
    arrears: sum(rows.map((r) => r.arrears)),
    owingCount: rows.filter(owes).length,
  }
}

/** Plain-language rent position of a lease, e.g. "2 months unpaid (Rs 100,000)". */
export function rentPosition(
  r: RollRow,
  currency: string,
): { label: string; tone: 'bad' | 'good' | 'neutral' } {
  if (owes(r)) {
    const months = r.months_unpaid === 1 ? '1 month' : `${r.months_unpaid} months`
    return { label: `${months} unpaid (${formatMoney(r.arrears, currency)})`, tone: 'bad' }
  }
  if (r.status === 'upcoming') return { label: `Starts ${r.start_date}`, tone: 'neutral' }
  if (compare(r.paid_ahead, '0.00') > 0)
    return { label: `Paid up · ${formatMoney(r.paid_ahead, currency)} ahead`, tone: 'good' }
  return { label: 'Paid up', tone: 'good' }
}

/** "Ends 2026-12-31 (in 20 days)", "Ended 2026-04-30", "No end date". */
export function endLabel(r: RollRow): string {
  const end = r.ended_on ?? r.end_date
  if (!end) return 'No end date'
  if (r.status === 'ended') return `Ended ${end}`
  if (r.days_to_end !== null && r.days_to_end <= EXPIRING_DAYS) {
    return `Ends ${end} (${r.days_to_end === 0 ? 'today' : r.days_to_end === 1 ? 'tomorrow' : `in ${r.days_to_end} days`})`
  }
  return `Ends ${end}`
}
