import { supabase, unwrap } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import type { PartyInput } from './schema'

export type Party = Database['public']['Tables']['parties']['Row']

export const partyKeys = {
  all: (orgId: string) => ['parties', orgId] as const,
  detail: (orgId: string, id: string) => ['parties', orgId, id] as const,
}

const requireOneRow = <T,>(rows: T[]): T => {
  if (rows.length !== 1) throw new Error('You do not have permission to do that.')
  return rows[0]
}

export async function fetchParties(orgId: string) {
  return unwrap(await supabase.from('parties').select('*').eq('org_id', orgId).order('name'))
}

export async function fetchParty(orgId: string, id: string): Promise<Party | null> {
  return unwrap<Party | null>(await supabase.from('parties').select('*').eq('org_id', orgId).eq('id', id).maybeSingle())
}

export async function createParty(orgId: string, input: PartyInput): Promise<Party> {
  return unwrap(await supabase.from('parties').insert({ org_id: orgId, ...input }).select().single())
}

export async function updateParty(orgId: string, id: string, input: PartyInput) {
  return requireOneRow(unwrap(await supabase.from('parties').update(input).eq('org_id', orgId).eq('id', id).select()))
}

export async function deleteParty(orgId: string, id: string) {
  requireOneRow(unwrap(await supabase.from('parties').delete().eq('org_id', orgId).eq('id', id).select('id')))
}
