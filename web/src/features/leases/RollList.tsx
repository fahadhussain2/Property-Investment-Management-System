import { FileSignatureIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { leaseLabel } from '@/features/properties/units'
import { endLabel, rentPosition, type RollRow } from './rentRoll'
import { formatDate } from '@/lib/dates'

const TONE = {
  bad: 'bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-300',
  good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300',
  neutral: 'bg-muted text-muted-foreground',
}

/** Leases with their rent position; each row opens the lease. Stacks on phones. */
export function RollList({
  rows,
  currency,
  empty,
  stacked,
}: {
  rows: RollRow[]
  currency: string
  empty?: ReactNode
  /** Always stack the rent position under the lease (a narrow column, e.g. the property page). */
  stacked?: boolean
}) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={FileSignatureIcon} title="No leases here">
        {empty}
      </EmptyState>
    )
  }
  return (
    <ul className="divide-y rounded-lg border" data-testid="rent-roll">
      {rows.map((r) => {
        const pos = rentPosition(r, currency)
        return (
          <li key={r.lease_id}>
            <Link
              to={`/leases/${r.lease_id}`}
              className={cn(
                'grid grid-cols-1 gap-1 px-4 py-3 hover:bg-accent',
                !stacked && 'sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4',
              )}
              data-testid={`lease-${r.property_code}`}
            >
              <div className="min-w-0">
                <div className="font-medium break-words">{leaseLabel(r)}</div>
                <div className="text-sm text-muted-foreground">
                  <span className="tabular-nums">{formatMoney(r.monthly_rent, currency)}</span>
                  /month · {endLabel(r)}
                  {r.last_rent_date && <> · last rent {formatDate(r.last_rent_date)}</>}
                </div>
              </div>
              <span
                className={cn(
                  'justify-self-start rounded-full px-2 py-0.5 text-xs font-medium',
                  !stacked && 'sm:justify-self-end',
                  TONE[pos.tone],
                )}
                data-testid="rent-position"
              >
                {pos.label}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
