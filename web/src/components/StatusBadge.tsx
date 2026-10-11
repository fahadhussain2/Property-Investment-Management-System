import { ENTRY_STATE, type EntryState } from '@/lib/entryState'
import { HOLDING_STATUS, PROPERTY_STATUS, type HoldingStatus, type PropertyStatus } from '@/lib/labels'
import { cn } from '@/lib/utils'

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function PropertyStatusBadge({ status, forSale }: { status: PropertyStatus; forSale?: boolean }) {
  const s = PROPERTY_STATUS[status]
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={cn(pill, s.className)}>{s.label}</span>
      {forSale && status !== 'sold' && <span className={cn(pill, 'bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-300')}>For sale</span>}
    </span>
  )
}

export function HoldingStatusBadge({ status }: { status: HoldingStatus }) {
  const s = HOLDING_STATUS[status]
  return <span className={cn(pill, s.className)}>{s.label}</span>
}

/** Corrected / Voided / Reversal beside an entry that no longer counts. Never crossed out itself (it sits outside the struck text). */
export function EntryStateBadge({ state }: { state: EntryState | null }) {
  if (!state) return null
  const s = ENTRY_STATE[state]
  return (
    <span className={cn(pill, 'ml-1.5 align-middle', s.className)} data-testid="entry-state">
      {s.label}
    </span>
  )
}
