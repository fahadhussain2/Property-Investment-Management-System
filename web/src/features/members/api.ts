import { supabase, unwrap } from '@/lib/supabase'
import type { Role } from '@/features/org/api'

export const memberKeys = {
  members: (orgId: string) => ['members', orgId] as const,
  invitations: (orgId: string) => ['invitations', orgId] as const,
}

export async function fetchMembers(orgId: string) {
  return unwrap(await supabase.rpc('org_members', { p_org: orgId }))
}

export async function fetchPendingInvitations(orgId: string) {
  return unwrap(
    await supabase
      .from('invitations')
      .select('id, email, role, created_at')
      .eq('org_id', orgId)
      .is('accepted_at', null)
      .order('created_at'),
  )
}

export async function inviteMember(orgId: string, email: string, role: Role) {
  unwrap(await supabase.from('invitations').insert({ org_id: orgId, email, role }))
}

export async function revokeInvitation(id: string) {
  unwrap(await supabase.from('invitations').delete().eq('id', id))
}

// RLS turns a forbidden update/delete into "0 rows changed", not an error, so check the count.
const requireOneRow = (rows: unknown[]) => {
  if (rows.length !== 1) throw new Error('You do not have permission to do that.')
}

export async function changeRole(orgId: string, userId: string, role: Role) {
  requireOneRow(
    unwrap(await supabase.from('memberships').update({ role }).eq('org_id', orgId).eq('user_id', userId).select('user_id')),
  )
}

export async function removeMember(orgId: string, userId: string) {
  requireOneRow(
    unwrap(await supabase.from('memberships').delete().eq('org_id', orgId).eq('user_id', userId).select('user_id')),
  )
}

/** Link the owner shares (e.g. on WhatsApp); signing up with this email joins the business. */
export const inviteLink = (email: string) =>
  `${window.location.origin}/signup?email=${encodeURIComponent(email)}`
