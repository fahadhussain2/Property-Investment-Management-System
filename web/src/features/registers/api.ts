import { supabase, unwrap } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { toLedgerLine, toRegisterRow } from './model'
import type { EntryInput, RegisterInput } from './schema'

/**
 * Everything about registers lives under ['registers', orgId]. Writes invalidate only this: a register never
 * changes any book, report or dashboard figure, so nothing else is refreshed (spec 007 §6).
 */
export const registerKeys = {
  all: (orgId: string) => ['registers', orgId] as const,
  list: (orgId: string) => ['registers', orgId, 'list'] as const,
  detail: (orgId: string, id: string) => ['registers', orgId, 'detail', id] as const,
  ledger: (orgId: string, id: string) => ['registers', orgId, 'ledger', id] as const,
}

// RLS turns a forbidden update/delete into "0 rows changed", not an error.
const requireOneRow = <T,>(rows: T[]): T => {
  if (rows.length !== 1) throw new Error('You do not have permission to do that.')
  return rows[0]
}

// Money goes to the database as the decimal string it is (PostgREST reads it into numeric exactly); the generated
// types call it a number, hence the casts.
const money = (m: string) => m as unknown as number

export async function fetchRegisters(orgId: string) {
  const rows = unwrap(
    await supabase.from('registers_overview').select('*').eq('org_id', orgId).order('is_active', { ascending: false }).order('name'),
  )
  return rows.map(toRegisterRow)
}

export async function fetchRegister(orgId: string, id: string) {
  const row = unwrap(await supabase.from('registers_overview').select('*').eq('org_id', orgId).eq('id', id).maybeSingle())
  return row ? toRegisterRow(row) : null
}

export async function fetchLedger(id: string) {
  return unwrap(await supabase.rpc('register_ledger', { p_register: id })).map(toLedgerLine)
}

export async function createRegister(orgId: string, input: RegisterInput): Promise<string> {
  const row = {
    org_id: orgId,
    name: input.name,
    opening_balance: input.opening_balance,
    opening_date: input.opening_date,
  } as unknown as Database['public']['Tables']['registers']['Insert']
  const created = unwrap<{ id: string } | null>(await supabase.from('registers').insert(row).select('id').single())
  if (!created) throw new Error('The register could not be saved.')
  return created.id
}

export async function updateRegister(orgId: string, id: string, input: Partial<RegisterInput> & { is_active?: boolean }) {
  const patch = input as unknown as Database['public']['Tables']['registers']['Update']
  requireOneRow(unwrap(await supabase.from('registers').update(patch).eq('org_id', orgId).eq('id', id).select('id')))
}

export async function deleteRegister(orgId: string, id: string) {
  requireOneRow(unwrap(await supabase.from('registers').delete().eq('org_id', orgId).eq('id', id).select('id')))
}

export async function addEntry(registerId: string, input: EntryInput) {
  unwrap(
    await supabase.rpc('add_register_entry', {
      p_register: registerId,
      p_date: input.entry_date,
      p_description: input.description,
      p_direction: input.direction,
      p_amount: money(input.amount),
    }),
  )
}

export async function correctEntry(entryId: string, input: EntryInput) {
  unwrap(
    await supabase.rpc('correct_register_entry', {
      p_entry: entryId,
      p_date: input.entry_date,
      p_description: input.description,
      p_direction: input.direction,
      p_amount: money(input.amount),
      p_reason: input.reason ?? undefined,
    }),
  )
}

export async function voidEntry(entryId: string, reason: string | null) {
  unwrap(await supabase.rpc('void_register_entry', { p_entry: entryId, p_reason: reason ?? undefined }))
}
