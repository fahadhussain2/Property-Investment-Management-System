import type { Database } from '@/lib/database.types'
import type { HoldingClass } from '@/lib/labels'
import { supabase, unwrap } from '@/lib/supabase'
import type { HoldingInput, RateInput } from './schema'

export type Holding = Database['public']['Tables']['holdings']['Row']
/** A holdings_overview row. The view's columns are all nullable in the generated types; these never are. */
export type HoldingRow = Omit<Database['public']['Views']['holdings_overview']['Row'], 'id' | 'code' | 'class' | 'status' | 'org_id'> & {
  id: string
  org_id: string
  code: string
  class: HoldingClass
  status: 'held' | 'partly_sold' | 'sold'
}
export type Valuation = Database['public']['Functions']['holdings_valuation']['Returns'][number]
export type MetalRate = Database['public']['Tables']['metal_rates']['Row']

export const holdingKeys = {
  all: (orgId: string) => ['holdings', orgId] as const,
  detail: (orgId: string, id: string) => ['holdings', orgId, 'detail', id] as const,
  valuation: (orgId: string) => ['holdings', orgId, 'valuation'] as const,
  rates: (orgId: string, metal: string) => ['holdings', orgId, 'rates', metal] as const,
}

const requireOneRow = <T,>(rows: T[]): T => {
  if (rows.length !== 1) throw new Error('You do not have permission to do that.')
  return rows[0]
}

/** Every vehicle, gold and silver item with its cost, weight, status and value (holdings_overview). */
export async function fetchHoldings(orgId: string) {
  return unwrap(await supabase.from('holdings_overview').select('*').eq('org_id', orgId).order('code')) as HoldingRow[]
}

export async function fetchHolding(orgId: string, id: string) {
  return unwrap(await supabase.from('holdings_overview').select('*').eq('org_id', orgId).eq('id', id).maybeSingle()) as HoldingRow | null
}

export async function createHolding(orgId: string, cls: HoldingClass, input: HoldingInput): Promise<Holding> {
  const row = { org_id: orgId, class: cls, ...input } as Database['public']['Tables']['holdings']['Insert']
  return unwrap(await supabase.from('holdings').insert(row).select().single())
}

export async function updateHolding(orgId: string, id: string, input: HoldingInput) {
  const patch = input as Database['public']['Tables']['holdings']['Update']
  return requireOneRow(unwrap(await supabase.from('holdings').update(patch).eq('org_id', orgId).eq('id', id).select()))
}

export async function deleteHolding(orgId: string, id: string) {
  requireOneRow(unwrap(await supabase.from('holdings').delete().eq('org_id', orgId).eq('id', id).select('id')))
}

export async function fetchHoldingBreakdown(orgId: string, id: string) {
  return unwrap(await supabase.rpc('holding_breakdown', { p_org: orgId, p_holding: id }))
}

/** Per-class totals at cost and at the latest rate, as of today (the organization's today). */
export async function fetchValuation(orgId: string) {
  return unwrap(await supabase.rpc('holdings_valuation', { p_org: orgId }))
}

export async function fetchRates(orgId: string, metal: 'gold' | 'silver') {
  return unwrap(
    await supabase.from('metal_rates').select('*').eq('org_id', orgId).eq('metal', metal).order('rate_date', { ascending: false }).limit(10),
  )
}

/** One rate per metal per day: entering another rate for the same day replaces it. */
export async function setRate(orgId: string, metal: 'gold' | 'silver', input: RateInput) {
  const row = { org_id: orgId, metal, rate_date: input.rate_date, rate_per_tola: input.rate_per_tola } as unknown as Database['public']['Tables']['metal_rates']['Insert']
  return unwrap(await supabase.from('metal_rates').upsert(row, { onConflict: 'org_id,metal,rate_date' }).select().single())
}
