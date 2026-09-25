import { supabase, unwrap } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type Org = Database['public']['Functions']['my_organizations']['Returns'][number]
export type Role = Database['public']['Enums']['member_role']

export const orgKeys = {
  mine: (userId: string) => ['my-orgs', userId] as const,
}

/** Accepts any pending invitations for the signed-in user, then lists their organizations. */
export async function fetchMyOrganizations(): Promise<Org[]> {
  unwrap(await supabase.rpc('accept_invitations'))
  return unwrap(await supabase.rpc('my_organizations'))
}

export async function createOrganization(input: {
  name: string
  currency: string
  fiscalYearStartMonth: number
}): Promise<string> {
  return unwrap(
    await supabase.rpc('create_organization', {
      p_name: input.name,
      p_currency: input.currency,
      p_fiscal_year_start_month: input.fiscalYearStartMonth,
    }),
  )
}
