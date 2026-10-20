import { EntryStateBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { CANCELLED_AMOUNT } from '@/lib/entryState'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { displayOrder, voidedNote, type LedgerLine, type RegisterRow } from './model'
import { usePrinting } from './usePrinting'

type Props = {
  register: RegisterRow
  lines: LedgerLine[]
  currency: string
  /** Show Correct and Void on live lines. */
  canEdit: boolean
  /** Member emails by user id; undefined while they are not available. */
  members: Map<string, string> | undefined
  onCorrect: (line: LedgerLine) => void
  onVoid: (line: LedgerLine) => void
}

/**
 * The register with the balance after every line: newest first on screen, oldest first on paper (displayOrder), with
 * the opening balance at the start of the register either way (the bottom on screen, the top on paper). Voided lines
 * stay where they are, greyed out and crossed out, with a label, a red line through the amount and who voided them. A table from
 * lg up (and on paper, where the phone list would be too narrow); a stacked list on phones.
 */
export function Ledger({ register, lines, currency, canEdit, members, onCorrect, onVoid }: Props) {
  const m = (x: string) => formatMoney(x, currency)
  const note = (l: LedgerLine) => voidedNote(l, members ? (members.get(l.voided_by ?? '') ?? null) : undefined)
  const byId = new Map(lines.map((l) => [l.id, l]))
  const printing = usePrinting()
  const shown = displayOrder(lines, printing)

  // `anchor`: the id prefix of the layout this renders in (the table and the phone list both exist in the page).
  const detail = (l: LedgerLine, anchor: string) => (
    <>
      {l.state && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {note(l)}
          {l.replaced_by_id && (
            <>
              {' · '}
              <a href={`#${anchor}-${l.replaced_by_id}`} className="underline">
                see the correction
              </a>
            </>
          )}
        </span>
      )}
      {l.replaces_id && byId.has(l.replaces_id) && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Correction of the line of {formatDate(byId.get(l.replaces_id)!.date)}{' '}
          <a href={`#${anchor}-${l.replaces_id}`} className="underline">
            (see it)
          </a>
        </span>
      )}
    </>
  )
  const actions = (l: LedgerLine) =>
    canEdit &&
    l.state === null && (
      <span className="flex gap-1 print:hidden">
        <Button variant="outline" size="xs" onClick={() => onCorrect(l)}>
          Correct
        </Button>
        <Button variant="outline" size="xs" onClick={() => onVoid(l)}>
          Void
        </Button>
      </span>
    )
  const title = (l: LedgerLine) => (
    <span>
      <span className={cn('font-medium', l.state && 'line-through')}>{l.description}</span>
      <EntryStateBadge state={l.state} />
    </span>
  )

  const openingRow = (
    <tr data-testid="ledger-opening-row">
      <td className="px-4 py-2 tabular-nums">{register.opening_date ? formatDate(register.opening_date) : ''}</td>
      <td className="px-4 py-2 text-muted-foreground">Opening balance</td>
      <td />
      <td />
      <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums" data-testid="ledger-opening">
        {m(register.opening_balance)}
      </td>
      <td className="print:hidden" />
    </tr>
  )
  const openingItem = (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="ledger-opening-item">
      <span className="text-muted-foreground">
        Opening balance{register.opening_date ? ` · ${formatDate(register.opening_date)}` : ''}
      </span>
      <span className="tabular-nums">{m(register.opening_balance)}</span>
    </li>
  )

  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground print:hidden">Newest first. Print and CSV list the register from the oldest entry.</p>
      {/* Desktop and print: a table. */}
      <div className="hidden overflow-x-auto rounded-lg border lg:block print:block print:border-0" data-testid="register-ledger">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground print:bg-transparent">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">In</th>
              <th className="px-4 py-2 text-right font-medium">Out</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
              <th className="w-0 px-4 py-2 print:hidden">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {printing && openingRow}
            {shown.map((l) => (
              <tr key={l.id} id={`entry-${l.id}`} data-testid="ledger-row" className={cn(l.state && 'text-muted-foreground')}>
                <td className="px-4 py-2 align-top whitespace-nowrap tabular-nums">{formatDate(l.date)}</td>
                <td className="px-4 py-2 align-top">
                  {title(l)}
                  {detail(l, 'entry')}
                </td>
                <td className={cn('px-4 py-2 text-right align-top whitespace-nowrap tabular-nums', l.state && l.direction === 'in' && CANCELLED_AMOUNT)}>
                  {l.direction === 'in' ? m(l.amount) : ''}
                </td>
                <td className={cn('px-4 py-2 text-right align-top whitespace-nowrap tabular-nums', l.state && l.direction === 'out' && CANCELLED_AMOUNT)}>
                  {l.direction === 'out' ? m(l.amount) : ''}
                </td>
                <td className="px-4 py-2 text-right align-top whitespace-nowrap tabular-nums">{m(l.balance)}</td>
                <td className="px-4 py-2 align-top print:hidden">{actions(l)}</td>
              </tr>
            ))}
            {!printing && openingRow}
          </tbody>
        </table>
      </div>

      {/* Phones: a stacked list. */}
      <ul className="divide-y rounded-lg border lg:hidden print:hidden" data-testid="register-ledger-list">
        {shown.map((l) => (
          <li key={l.id} id={`entry-m-${l.id}`} className={cn('grid grid-cols-1 gap-1 px-4 py-3 text-sm', l.state && 'text-muted-foreground')}>
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words">{title(l)}</span>
              <span className={cn('shrink-0 tabular-nums', l.state && CANCELLED_AMOUNT)}>
                {l.direction === 'out' ? '-' : ''}
                {m(l.amount)}
              </span>
            </span>
            <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{formatDate(l.date)}</span>
              <span className="tabular-nums">Balance {m(l.balance)}</span>
            </span>
            {detail(l, 'entry-m')}
            {actions(l) && <span className="mt-1">{actions(l)}</span>}
          </li>
        ))}
        {openingItem}
      </ul>
    </>
  )
}
