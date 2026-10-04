import { Link } from 'react-router-dom'
import { MoneyTable, td, tdNum, th, thNum } from '@/components/MoneyTable'
import type { CsvSpec } from '@/components/ReportShell'
import { VOUCHER_TYPES, type VoucherType } from '@/lib/labels'
import { formatMoney, toMoney } from '@/lib/money'
import { formatDate } from '@/lib/dates'

export type LedgerRow = {
  seq: number
  entry_date: string
  voucher_id: string | null
  voucher_number: string | null
  voucher_type: VoucherType | null
  memo: string | null
  property_code: string | null
  party_name?: string | null
  account_name?: string | null
  debit: number
  credit: number
  balance: number
}

/**
 * Opening balance, entries with a running balance, and the closing balance.
 * `columns` names the two amount columns in plain words (e.g. "Money in" / "Money out" for a cash book).
 */
export function LedgerTable({
  rows,
  currency,
  columns,
  testid,
}: {
  rows: LedgerRow[]
  currency: string
  columns: [string, string]
  testid?: string
}) {
  const m = (x: number) => formatMoney(toMoney(x), currency)
  const opening = rows.find((r) => r.seq === 0)
  const lines = rows.filter((r) => r.seq > 0)
  const closing = lines.at(-1)?.balance ?? opening?.balance ?? 0
  const detail = (r: LedgerRow) =>
    [r.account_name, r.property_code, r.party_name, r.memo].filter(Boolean).join(' · ')
  return (
    <>
      {/* Phones: one card per movement, amount and running balance always visible. */}
      <ul
        className="divide-y rounded-lg border text-sm sm:hidden print:hidden"
        data-testid={testid && `${testid}-list`}
      >
        <li className="flex justify-between gap-3 bg-muted/30 px-3 py-2">
          <span>Opening balance</span>
          <span className="tabular-nums">{m(opening?.balance ?? 0)}</span>
        </li>
        {lines.map((r) => (
          <li key={r.seq} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2">
            <span className="min-w-0">
              {r.voucher_id && (
                <Link to={`/entries/${r.voucher_id}`} className="block truncate font-medium">
                  {r.voucher_type ? VOUCHER_TYPES[r.voucher_type] : ''} · {r.voucher_number}
                </Link>
              )}
              <span className="block truncate text-xs text-muted-foreground">
                {formatDate(r.entry_date)}
                {detail(r) ? ` · ${detail(r)}` : ''}
              </span>
            </span>
            <span className="text-right whitespace-nowrap tabular-nums">
              <span className="block">
                {r.debit ? `${columns[0]} ${m(r.debit)}` : `${columns[1]} ${m(r.credit)}`}
              </span>
              <span className="block text-xs text-muted-foreground">Balance {m(r.balance)}</span>
            </span>
          </li>
        ))}
        {lines.length === 0 && (
          <li className="px-3 py-2 text-muted-foreground">No entries in this period</li>
        )}
        <li className="flex justify-between gap-3 px-3 py-2 font-semibold">
          <span>Closing balance</span>
          <span className="tabular-nums">{m(closing)}</span>
        </li>
      </ul>
      <div className="hidden sm:block print:block">
        <MoneyTable testid={testid} minWidth="40rem">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Entry</th>
              <th className={thNum}>{columns[0]}</th>
              <th className={thNum}>{columns[1]}</th>
              <th className={thNum}>Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="bg-muted/30">
              <td className={td} colSpan={4}>
                Opening balance
              </td>
              <td className={tdNum} data-testid="ledger-opening">
                {m(opening?.balance ?? 0)}
              </td>
            </tr>
            {lines.map((r) => (
              <tr key={r.seq}>
                <td className={`${td} whitespace-nowrap tabular-nums`}>
                  {formatDate(r.entry_date)}
                </td>
                <td className={td}>
                  {r.voucher_id ? (
                    <Link to={`/entries/${r.voucher_id}`} className="font-medium hover:underline">
                      {r.voucher_type ? VOUCHER_TYPES[r.voucher_type] : ''} · {r.voucher_number}
                    </Link>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {[r.account_name, r.property_code, r.party_name, r.memo]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </td>
                <td className={tdNum}>{r.debit ? m(r.debit) : ''}</td>
                <td className={tdNum}>{r.credit ? m(r.credit) : ''}</td>
                <td className={tdNum}>{m(r.balance)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td className={`${td} text-muted-foreground`} colSpan={5}>
                  No entries in this period
                </td>
              </tr>
            )}
            <tr className="border-t-2 font-semibold">
              <td className={td} colSpan={4}>
                Closing balance
              </td>
              <td className={tdNum} data-testid="ledger-closing">
                {m(closing)}
              </td>
            </tr>
          </tbody>
        </MoneyTable>
      </div>
    </>
  )
}

export function ledgerCsv(name: string, rows: LedgerRow[], columns: [string, string]): CsvSpec {
  return {
    name,
    headers: ['Date', 'Entry', 'Type', 'Details', columns[0], columns[1], 'Balance'],
    rows: rows.map((r) =>
      r.seq === 0
        ? [r.entry_date, '', '', 'Opening balance', '', '', toMoney(r.balance)]
        : [
            r.entry_date,
            r.voucher_number,
            r.voucher_type ? VOUCHER_TYPES[r.voucher_type] : '',
            [r.account_name, r.property_code, r.party_name, r.memo].filter(Boolean).join(' · '),
            r.debit ? toMoney(r.debit) : '',
            r.credit ? toMoney(r.credit) : '',
            toMoney(r.balance),
          ],
    ),
  }
}
