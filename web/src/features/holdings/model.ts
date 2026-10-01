import type { HoldingStatus } from '@/lib/labels'

/** Pure helpers for the Vehicles / Gold / Silver registers (no supabase import, so tests need no env). */

export type StatusFilter = 'all' | HoldingStatus
export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'held', label: 'Held' },
  { value: 'partly_sold', label: 'Partly sold' },
  { value: 'sold', label: 'Sold' },
]

type Filterable = { code: string; name: string | null; status: HoldingStatus; make?: string | null; model?: string | null; registration_no?: string | null }

export function filterHoldings<T extends Filterable>(rows: T[], { status = 'all', q = '' }: { status?: StatusFilter; q?: string }): T[] {
  const needle = q.trim().toLowerCase()
  return rows.filter(
    (h) =>
      (status === 'all' || h.status === status) &&
      (!needle ||
        [h.code, h.name, h.make, h.model, h.registration_no].some((v) => (v ?? '').toLowerCase().includes(needle))),
  )
}

export function statusCounts(rows: Filterable[]): Record<StatusFilter, number> {
  return Object.fromEntries(
    STATUS_FILTERS.map(({ value }) => [value, rows.filter((h) => value === 'all' || h.status === value).length]),
  ) as Record<StatusFilter, number>
}

/** A rate older than this many days is flagged, so nobody trusts a stale market value. */
export const STALE_RATE_DAYS = 7

/** Whole days between two YYYY-MM-DD dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export const isStaleRate = (rateDate: string | null | undefined, today: string) =>
  !!rateDate && daysBetween(rateDate, today) > STALE_RATE_DAYS

/** "Toyota Corolla 2022" from whatever is filled in. */
/** Engine capacity for display: 1300 → "1,300 cc". */
export const formatCc = (cc: number) => `${String(cc).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} cc`

export const vehicleTitle = (h: { make?: string | null; model?: string | null; year?: number | null }) =>
  [h.make, h.model, h.year].filter(Boolean).join(' ')
