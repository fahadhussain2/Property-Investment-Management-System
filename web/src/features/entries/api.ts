import type { QueryClient } from '@tanstack/react-query'
import type { Json } from '@/lib/database.types'
import type { VoucherType } from '@/lib/labels'
import { supabase, unwrap } from '@/lib/supabase'
import type { Payload } from './payload'

export type PreviewLine = {
  code: string
  name: string
  debit: string
  credit: string
  property_code: string | null
  party_name: string | null
  memo: string | null
  holding_code?: string | null
  /** grams moved by a gold/silver line (signed) */
  quantity_g?: string | null
}
export type Preview = { number: string; lines: PreviewLine[]; profit?: string; cost?: string }
export type Posted = { id: string; number: string; profit?: string; cost?: string }

type Ref = { id: string; number: string } | null
export type EntryDetail = {
  id: string
  org_id: string
  number: string
  type: VoucherType
  date: string
  status: 'posted' | 'reversed'
  amount: string
  memo: string | null
  payload: Record<string, unknown> | null
  created_at: string
  created_by: string | null
  property: { id: string; code: string; name: string | null } | null
  holding: { id: string; code: string; name: string | null; class: 'vehicle' | 'gold' | 'silver' } | null
  party: { id: string; name: string } | null
  reverses: Ref
  reversed_by: Ref
  replaced_by: Ref
  replaces: Ref
  lines: PreviewLine[]
  history: { at: string; action: string; user_id: string | null; details: Record<string, unknown> | null }[]
}

export const entryKeys = {
  all: (orgId: string) => ['entries', orgId] as const,
  detail: (id: string) => ['entry', id] as const,
}

const json = (p: unknown) => p as Json

/** Dry run: what post_voucher would record (the database rolls it back). */
export async function previewVoucher(orgId: string, payload: Payload | Record<string, unknown>) {
  return unwrap(await supabase.rpc('preview_voucher', { p_org: orgId, p: json(payload) })) as unknown as Preview
}

export async function postVoucher(orgId: string, payload: Payload | Record<string, unknown>) {
  return unwrap(await supabase.rpc('post_voucher', { p_org: orgId, p: json(payload) })) as unknown as Posted
}

/** Dry run of a correction (reverse + repost), so the number, cost and profit are the real ones. */
export async function previewEdit(id: string, payload: Payload) {
  return unwrap(await supabase.rpc('preview_edit', { p_voucher: id, p_changes: json(payload) })) as unknown as Preview
}

/** Reverse + repost with the new values (edit_voucher merges them over the stored payload). */
export async function editVoucher(id: string, payload: Payload) {
  return unwrap(await supabase.rpc('edit_voucher', { p_voucher: id, p_changes: json(payload) })) as unknown as Posted
}

export async function reverseVoucher(id: string, reason: string) {
  return unwrap(await supabase.rpc('reverse_voucher', { p_voucher: id, p_reason: reason })) as unknown as Posted
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function fetchEntry(id: string) {
  if (!UUID.test(id)) return null // a mistyped address is "not found", not an error
  return unwrap(await supabase.rpc('voucher_detail', { p_voucher: id })) as unknown as EntryDetail | null
}

export type EntryFilters = { type?: VoucherType | 'all'; from?: string; to?: string; limit?: number }

export async function fetchEntries(orgId: string, f: EntryFilters) {
  let q = supabase
    .from('vouchers')
    .select('id, number, type, date, amount, memo, status, reverses_id, property_id, party_id')
    .eq('org_id', orgId)
  if (f.type && f.type !== 'all') q = q.eq('type', f.type)
  if (f.from) q = q.gte('date', f.from)
  if (f.to) q = q.lte('date', f.to)
  return unwrap(await q.order('date', { ascending: false }).order('created_at', { ascending: false }).limit(f.limit ?? 500))
}

/** Everything that shows balances or history must refresh after a post, edit or void. */
export function invalidateAfterPosting(qc: QueryClient, orgId: string) {
  return Promise.all(
    [['account-balances', orgId], ['accounts', orgId], ['properties', orgId], ['vouchers', orgId], ['entries', orgId], ['entry'], ['reports', orgId], ['leases', orgId], ['holdings', orgId], ['documents', orgId]].map(
      (queryKey) => qc.invalidateQueries({ queryKey }),
    ),
  )
}
