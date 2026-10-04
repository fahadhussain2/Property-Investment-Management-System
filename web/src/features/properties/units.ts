import { formatDate } from '@/lib/dates'
// Units (spec 006): the parts of a property rented separately. Pure display logic: no lib/supabase import.

export type UnitState = 'rented' | 'whole_property' | 'vacant'

/** A property_units_overview row. The view's columns are all nullable in the generated types; these never are. */
export type UnitRow = {
  id: string
  property_id: string
  name: string
  notes: string | null
  state: UnitState
  lease_id: string | null
  tenant_id: string | null
  tenant_name: string | null
  lease_ends: string | null
  lease_count: number
}

type RawUnit = { [K in Exclude<keyof UnitRow, 'state'>]?: UnitRow[K] | null } & { state?: string | null }

export const toUnitRow = (r: RawUnit): UnitRow => ({
  id: r.id!,
  property_id: r.property_id!,
  name: r.name!,
  notes: r.notes ?? null,
  state: (r.state ?? 'vacant') as UnitState,
  lease_id: r.lease_id ?? null,
  tenant_id: r.tenant_id ?? null,
  tenant_name: r.tenant_name ?? null,
  lease_ends: r.lease_ends ?? null,
  lease_count: r.lease_count ?? 0,
})

/** "2 of 3 units rented"; null for a property without units. */
export function occupancyLabel(total: number, vacant: number): string | null {
  if (total <= 0) return null
  return `${total - vacant} of ${total} ${total === 1 ? 'unit' : 'units'} rented`
}

/** Who has the unit today: "Rented to Ali Traders until 2027-06-30", "Part of the whole-property lease", "Vacant". */
export function unitStateLabel(u: Pick<UnitRow, 'state' | 'tenant_name' | 'lease_ends'>): string {
  switch (u.state) {
    case 'rented':
      return `Rented to ${u.tenant_name}${u.lease_ends ? ` until ${formatDate(u.lease_ends)}` : ''}`
    case 'whole_property':
      return `Part of the whole-property lease (${u.tenant_name})`
    case 'vacant':
      return 'Vacant'
  }
}

/** A unit that ever had a lease is kept (its leases point at it); the database refuses the delete anyway. */
export const canDeleteUnit = (u: Pick<UnitRow, 'lease_count'>) => u.lease_count === 0

/** How a lease is named everywhere: "DP-25 · Shop 3 · Ali Traders", or "DP-25 · Ali Traders" for the whole property. */
export function leaseLabel(r: { property_code: string; unit_name?: string | null; tenant_name: string }): string {
  return [r.property_code, r.unit_name, r.tenant_name].filter(Boolean).join(' · ')
}
