import { supabase, unwrap } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import type { CategoryKind } from '@/lib/labels'
import { toMoney, type Money } from '@/lib/money'
import type { MoneyAccountInput } from './schema'

export { categorySchema, moneyAccountSchema, renameSchema } from './schema'

type AccountRow = Database['public']['Tables']['accounts']['Row']
export type AccountWithBalance = AccountRow & { balance: Money }

export const accountKeys = {
  all: (orgId: string) => ['accounts', orgId] as const,
}

/** All accounts of the organization with their current balance (natural sign). */
export async function fetchAccounts(orgId: string): Promise<AccountWithBalance[]> {
  const [accounts, balances] = await Promise.all([
    supabase.from('accounts').select('*').eq('org_id', orgId).order('code'),
    supabase.rpc('account_balances', { p_org: orgId }),
  ])
  const byId = new Map(unwrap(balances).map((b) => [b.account_id, b.balance]))
  return unwrap(accounts).map((a) => ({ ...a, balance: toMoney(byId.get(a.id)) }))
}

export async function addMoneyAccount(orgId: string, input: MoneyAccountInput) {
  return unwrap(
    await supabase.rpc('add_money_account', {
      p_org: orgId,
      p_kind: input.kind,
      p_name: input.name,
      p_bank_name: input.bank_name ?? undefined,
      p_account_no: input.account_no ?? undefined,
    }),
  )
}

export async function addCategoryAccount(orgId: string, kind: CategoryKind, name: string) {
  return unwrap(await supabase.rpc('add_category_account', { p_org: orgId, p_kind: kind, p_name: name }))
}

export async function updateAccount(orgId: string, id: string, patch: { name?: string; is_active?: boolean }) {
  const rows = unwrap(await supabase.from('accounts').update(patch).eq('org_id', orgId).eq('id', id).select('id'))
  if (rows.length !== 1) throw new Error('You do not have permission to do that.')
}
