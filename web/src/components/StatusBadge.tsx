import { PROPERTY_STATUS, type PropertyStatus } from '@/lib/labels'
import { cn } from '@/lib/utils'

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function PropertyStatusBadge({ status, forSale }: { status: PropertyStatus; forSale?: boolean }) {
  const s = PROPERTY_STATUS[status]
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={cn(pill, s.className)}>{s.label}</span>
      {forSale && status !== 'sold' && <span className={cn(pill, 'bg-violet-100 text-violet-900')}>For sale</span>}
    </span>
  )
}
