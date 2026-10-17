// Pure register logic (spec 007). No lib/supabase import, so unit tests need no environment.
// Money stays a decimal string everywhere; API numerics become Money at the edge.
import { formatDate } from '@/lib/dates'
import type { EntryState } from '@/lib/entryState'
import { toMoney, type Money } from '@/lib/money'

export type Direction = 'in' | 'out'

/** One row of `registers_overview`, with money converted. */
export type RegisterRow = {
  id: string
  name: string
  opening_balance: Money
  opening_date: string | null
  is_active: boolean
  total_in: Money
  total_out: Money
  balance: Money
  entry_count: number
  last_entry_date: string | null
}

type RawRegister = {
  id: string | null
  name: string | null
  opening_balance: number | string | null
  opening_date: string | null
  is_active: boolean | null
  total_in: number | string | null
  total_out: number | string | null
  balance: number | string | null
  entry_count: number | null
  last_entry_date: string | null
}

export const toRegisterRow = (r: RawRegister): RegisterRow => ({
  id: r.id ?? '',
  name: r.name ?? '',
  opening_balance: toMoney(r.opening_balance),
  opening_date: r.opening_date,
  is_active: r.is_active ?? true,
  total_in: toMoney(r.total_in),
  total_out: toMoney(r.total_out),
  balance: toMoney(r.balance),
  entry_count: r.entry_count ?? 0,
  last_entry_date: r.last_entry_date,
})

/** One line of `register_ledger`, with money converted and its state derived (rule 7: nothing stored). */
export type LedgerLine = {
  id: string
  date: string
  description: string
  direction: Direction
  amount: Money
  /** Balance after this line; a voided line carries the balance without itself. */
  balance: Money
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  replaced_by_id: string | null
  replaces_id: string | null
  /** null = live. */
  state: Exclude<EntryState, 'reversal'> | null
}

type RawLine = {
  entry_id: string
  entry_date: string
  description: string
  direction: string
  amount: number | string
  running_balance: number | string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  replaced_by_id: string | null
  replaces_id: string | null
}

export const toLedgerLine = (r: RawLine): LedgerLine => ({
  id: r.entry_id,
  date: r.entry_date,
  description: r.description,
  direction: r.direction === 'out' ? 'out' : 'in',
  amount: toMoney(r.amount),
  balance: toMoney(r.running_balance),
  voided_at: r.voided_at,
  voided_by: r.voided_by,
  void_reason: r.void_reason,
  replaced_by_id: r.replaced_by_id,
  replaces_id: r.replaces_id,
  state: r.voided_at === null ? null : r.replaced_by_id !== null ? 'corrected' : 'voided',
})

/**
 * "Voided 04/10/2026 by ali@x.com: wrong amount". `who`: the member's email, `null` when they have left the
 * business, `undefined` when the member list is not available (the name is then left out).
 */
export function voidedNote(l: LedgerLine, who: string | null | undefined): string {
  if (l.voided_at === null) return ''
  const by = who === undefined ? '' : ` by ${who ?? 'a former member'}`
  return `${l.state === 'corrected' ? 'Corrected' : 'Voided'} ${formatDate(l.voided_at)}${by}${l.void_reason ? `: ${l.void_reason}` : ''}`
}

/** The register as a CSV (spec §6): ISO dates, exact amounts, voided lines included with their status. */
export function registerCsv(register: RegisterRow, lines: LedgerLine[]): { headers: string[]; rows: (string | null)[][] } {
  return {
    headers: ['Date', 'Description', 'In', 'Out', 'Balance', 'Status', 'Reason'],
    rows: [
      [register.opening_date, 'Opening balance', null, null, register.opening_balance, null, null],
      ...lines.map((l) => [
        l.date,
        l.description,
        l.direction === 'in' ? l.amount : null,
        l.direction === 'out' ? l.amount : null,
        l.balance,
        l.state === null ? 'Live' : l.state === 'corrected' ? 'Corrected' : 'Voided',
        l.void_reason,
      ]),
    ],
  }
}
