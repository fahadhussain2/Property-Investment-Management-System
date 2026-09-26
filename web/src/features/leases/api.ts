import type { Database } from '@/lib/database.types'
import { supabase, unwrap } from '@/lib/supabase'
import { toRollRow } from './rentRoll'
import type { LeaseInput } from './schema'

export type Lease = Database['public']['Tables']['leases']['Row']
type LeaseUpdate = Database['public']['Tables']['leases']['Update']

/** Everything lease-related lives under ['leases', orgId], which invalidateAfterPosting refreshes. */
export const leaseKeys = {
  all: (orgId: string) => ['leases', orgId] as const,
  roll: (orgId: string) => ['leases', orgId, 'roll'] as const,
  detail: (orgId: string, id: string) => ['leases', orgId, 'detail', id] as const,
  expiring: (orgId: string) => ['leases', orgId, 'expiring'] as const,
}

const requireOneRow = <T>(rows: T[]): T => {
  if (rows.length !== 1) throw new Error('You do not have permission to do that.')
  return rows[0]
}

/** Every lease with its rent position as at the business's today. */
export async function fetchRentRoll(orgId: string) {
  return unwrap(await supabase.rpc('rent_roll', { p_org: orgId })).map(toRollRow)
}

export async function fetchLease(orgId: string, id: string) {
  const [lease, roll] = await Promise.all([
    supabase.from('leases').select('*').eq('org_id', orgId).eq('id', id).maybeSingle(),
    fetchRentRoll(orgId),
  ])
  return { lease: unwrap<Lease | null>(lease), roll: roll.find((r) => r.lease_id === id) ?? null }
}

export async function fetchExpiringLeases(orgId: string) {
  return unwrap(await supabase.rpc('expiring_leases', { p_org: orgId }))
}

// Money fields are decimal strings (Money); PostgREST casts them to numeric exactly.
export async function createLease(orgId: string, input: LeaseInput): Promise<Lease> {
  const row = {
    org_id: orgId,
    ...input,
  } as unknown as Database['public']['Tables']['leases']['Insert']
  return unwrap(await supabase.from('leases').insert(row).select().single())
}

export async function updateLease(
  orgId: string,
  id: string,
  input: Partial<LeaseInput> & { ended_on?: string | null },
) {
  return requireOneRow(
    unwrap(
      await supabase
        .from('leases')
        .update(input as unknown as LeaseUpdate)
        .eq('org_id', orgId)
        .eq('id', id)
        .select(),
    ),
  )
}

export async function deleteLease(orgId: string, id: string) {
  requireOneRow(
    unwrap(await supabase.from('leases').delete().eq('org_id', orgId).eq('id', id).select('id')),
  )
}
