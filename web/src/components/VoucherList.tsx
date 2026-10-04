import { ReceiptTextIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { VOUCHER_TYPES, type VoucherType } from '@/lib/labels'
import { formatMoney, toMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'

export type VoucherRow = {
  id: string
  number: string
  type: VoucherType
  date: string
  amount: number
  memo: string | null
  status: 'posted' | 'reversed'
  reverses_id: string | null
}

/** Timeline of entries for a property or party. Reversed entries and their reversals are shown struck through. */
export function VoucherList({ rows, currency }: { rows: VoucherRow[]; currency: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={ReceiptTextIcon} title="No entries yet">
        Purchases, rent, expenses and sales will appear here once you record them.
      </EmptyState>
    )
  }
  return (
    <ul className="divide-y rounded-lg border" data-testid="voucher-list">
      {rows.map((v) => {
        const cancelled = v.status === 'reversed' || v.reverses_id !== null
        return (
          <li key={v.id}>
            <Link
              to={`/entries/${v.id}`}
              className={cn(
                'flex items-start gap-3 px-4 py-3 text-sm hover:bg-accent',
                cancelled && 'text-muted-foreground',
              )}
            >
              <div className="w-24 shrink-0 tabular-nums">
                {formatDate(v.date)}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn('font-medium', cancelled && 'line-through')}>
                  {VOUCHER_TYPES[v.type]}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {v.number}
                  {v.memo ? ` · ${v.memo}` : ''}
                </div>
              </div>
              <div className={cn('shrink-0 tabular-nums', cancelled && 'line-through')}>
                {formatMoney(toMoney(v.amount), currency)}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
