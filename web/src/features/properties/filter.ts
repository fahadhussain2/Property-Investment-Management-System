import type { PropertyKind, PropertyStatus } from '@/lib/labels'

/** The subset of a property_summary row the register filters on. */
export type FilterableProperty = {
  code: string
  name: string | null
  kind: PropertyKind
  status: PropertyStatus
  for_sale: boolean
}

export type StatusFilter = 'all' | 'for_sale' | PropertyStatus

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'vacant', label: 'Vacant' },
  { value: 'rented', label: 'Rented' },
  { value: 'for_sale', label: 'For sale' },
  { value: 'under_agreement', label: 'Under agreement' },
  { value: 'sold', label: 'Sold' },
]

/** "For sale" is a flag, not a status: a rented property can also be for sale. Sold ones never are. */
export function matchesStatus(p: FilterableProperty, f: StatusFilter): boolean {
  if (f === 'all') return true
  if (f === 'for_sale') return p.for_sale && p.status !== 'sold'
  return p.status === f
}

export function filterProperties<T extends FilterableProperty>(
  rows: T[],
  { status = 'all', kind = 'all', q = '' }: { status?: StatusFilter; kind?: PropertyKind | 'all'; q?: string },
): T[] {
  const needle = q.trim().toLowerCase()
  return rows.filter(
    (p) =>
      matchesStatus(p, status) &&
      (kind === 'all' || p.kind === kind) &&
      (!needle || p.code.toLowerCase().includes(needle) || (p.name ?? '').toLowerCase().includes(needle)),
  )
}

export function statusCounts(rows: FilterableProperty[]): Record<StatusFilter, number> {
  return Object.fromEntries(
    STATUS_FILTERS.map(({ value }) => [value, rows.filter((p) => matchesStatus(p, value)).length]),
  ) as Record<StatusFilter, number>
}
