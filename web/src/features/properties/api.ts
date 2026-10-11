import { supabase, unwrap } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import type { PropertyInput, UnitInput } from './schema'
import { toUnitRow, type UnitRow } from './units'

export type PropertySummary = Database['public']['Functions']['property_summary']['Returns'][number]
export type Property = Database['public']['Tables']['properties']['Row']

export const propertyKeys = {
  all: (orgId: string) => ['properties', orgId] as const,
  detail: (orgId: string, id: string) => ['properties', orgId, id] as const,
  // Units and occupancy live under ['properties', orgId], so refreshing properties refreshes them too.
  units: (orgId: string, propertyId: string) => ['properties', orgId, 'units', propertyId] as const,
  occupancy: (orgId: string) => ['properties', orgId, 'occupancy'] as const,
}

// RLS turns a forbidden update/delete into "0 rows changed", not an error.
const requireOneRow = <T,>(rows: T[]): T => {
  if (rows.length !== 1) throw new Error('You do not have permission to do that.')
  return rows[0]
}

export async function fetchPropertySummaries(orgId: string) {
  return unwrap(await supabase.rpc('property_summary', { p_org: orgId }))
}

export async function fetchProperty(orgId: string, id: string) {
  const [property, summary] = await Promise.all([
    supabase.from('properties').select('*').eq('org_id', orgId).eq('id', id).maybeSingle(),
    supabase.rpc('property_summary', { p_org: orgId, p_property: id }),
  ])
  return { property: unwrap<Property | null>(property), summary: unwrap(summary)[0] ?? null }
}

export async function createProperty(orgId: string, input: PropertyInput): Promise<Property> {
  return unwrap(await supabase.from('properties').insert({ org_id: orgId, ...input }).select().single())
}

export async function updateProperty(orgId: string, id: string, input: Partial<PropertyInput> & { for_sale?: boolean; asking_price?: string | null }) {
  // asking_price is a decimal string (Money); PostgREST casts it to numeric exactly.
  const patch = input as Database['public']['Tables']['properties']['Update']
  return requireOneRow(unwrap(await supabase.from('properties').update(patch).eq('org_id', orgId).eq('id', id).select()))
}

export async function deleteProperty(orgId: string, id: string) {
  requireOneRow(unwrap(await supabase.from('properties').delete().eq('org_id', orgId).eq('id', id).select('id')))
}

/** Entries (vouchers) that mention a property, party, lease or holding, newest first. */
export async function fetchVouchersFor(
  orgId: string,
  filter: { property_id: string } | { party_id: string } | { lease_id: string } | { holding_id: string },
) {
  const [column, value] = Object.entries(filter)[0]
  return unwrap(
    await supabase
      .from('vouchers')
      .select('id, number, type, date, amount, memo, status, reverses_id, replaced_by_id')
      .eq('org_id', orgId)
      .eq(column, value)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
  )
}

// Units (spec 006) ---------------------------------------------------------------------------------------

/** The units of a property with who has each one today, by name. */
export async function fetchUnits(orgId: string, propertyId: string): Promise<UnitRow[]> {
  const rows = unwrap(
    await supabase
      .from('property_units_overview')
      .select('*')
      .eq('org_id', orgId)
      .eq('property_id', propertyId)
      .order('name'),
  )
  return rows.map(toUnitRow)
}

/** Occupancy of every property that has units: property id → { total, vacant }. */
export async function fetchOccupancy(orgId: string) {
  const rows = unwrap(
    await supabase
      .from('properties_overview')
      .select('id, units_total, units_vacant')
      .eq('org_id', orgId)
      .gt('units_total', 0),
  )
  return new Map(rows.map((r) => [r.id!, { total: r.units_total ?? 0, vacant: r.units_vacant ?? 0 }]))
}

export type PropertyUnit = Database['public']['Tables']['property_units']['Row']

export async function createUnit(orgId: string, propertyId: string, input: UnitInput): Promise<PropertyUnit> {
  return unwrap(
    await supabase
      .from('property_units')
      .insert({ org_id: orgId, property_id: propertyId, ...input })
      .select()
      .single(),
  )
}

export async function updateUnit(orgId: string, id: string, input: UnitInput) {
  return requireOneRow(
    unwrap(await supabase.from('property_units').update(input).eq('org_id', orgId).eq('id', id).select()),
  )
}

export async function deleteUnit(orgId: string, id: string) {
  requireOneRow(unwrap(await supabase.from('property_units').delete().eq('org_id', orgId).eq('id', id).select('id')))
}
