// Pure loan logic (spec 008). No lib/supabase import, so unit tests need no environment.
// Money stays a decimal string everywhere; API numerics become Money at the edge.
import type { LedgerRow } from '@/components/LedgerTable'
import { isZero, sum, toMoney, type Money } from '@/lib/money'
import type { VoucherType } from '@/lib/labels'

/** One row of `loan_balances`. `party_id` is null for the "Not assigned to a lender" row. */
export type LoanRow = {
  party_id: string | null
  name: string
  borrowed: Money
  repaid: Money
  owed: Money
  last_date: string | null
}

type RawLoan = {
  party_id: string | null
  name: string
  borrowed: number | string | null
  repaid: number | string | null
  owed: number | string | null
  last_date: string | null
}

export const toLoanRow = (r: RawLoan): LoanRow => ({
  party_id: r.party_id,
  name: r.name,
  borrowed: toMoney(r.borrowed),
  repaid: toMoney(r.repaid),
  owed: toMoney(r.owed),
  last_date: r.last_date,
})

/** Lenders with something owed, lenders with nothing owed, and the journal amount that has no lender. */
export function splitLoans(rows: LoanRow[]): { open: LoanRow[]; settled: LoanRow[]; unassigned: LoanRow | null } {
  const lenders = rows.filter((r) => r.party_id !== null)
  return {
    open: lenders.filter((r) => !isZero(r.owed)),
    settled: lenders.filter((r) => isZero(r.owed)),
    unassigned: rows.find((r) => r.party_id === null) ?? null,
  }
}

/** Everything owed to lenders, including the amount with no lender: equals the Loans Payable balance. */
export const totalOwed = (rows: LoanRow[]): Money => sum(rows.map((r) => r.owed))

type RawLedger = {
  seq: number
  entry_date: string
  voucher_id: string | null
  voucher_number: string | null
  voucher_type: string | null
  memo: string | null
  debit: number
  credit: number
  balance: number
}

/**
 * `loan_ledger` as the rows the shared statement table draws: an opening line of 0 first, then each line.
 * Debit = repaid (what we owe goes down), credit = borrowed (it goes up).
 */
export function toStatementRows(lines: RawLedger[]): LedgerRow[] {
  const first = lines[0]?.entry_date ?? ''
  return [
    { seq: 0, entry_date: first, voucher_id: null, voucher_number: null, voucher_type: null, memo: null, property_code: null, debit: 0, credit: 0, balance: 0 },
    ...lines.map((l) => ({
      seq: l.seq,
      entry_date: l.entry_date,
      voucher_id: l.voucher_id,
      voucher_number: l.voucher_number,
      voucher_type: l.voucher_type as VoucherType | null,
      memo: l.memo,
      property_code: null,
      debit: l.debit,
      credit: l.credit,
      balance: l.balance,
    })),
  ]
}
