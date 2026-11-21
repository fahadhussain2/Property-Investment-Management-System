import { supabase, unwrap } from '@/lib/supabase'
import { toLoanRow, toStatementRows } from './model'

/**
 * Everything about loans lives under ['loans', orgId]. Loans move cash, so invalidateAfterPosting() refreshes this
 * with the books after every post, edit or void.
 */
export const loanKeys = {
  all: (orgId: string) => ['loans', orgId] as const,
  list: (orgId: string) => ['loans', orgId, 'list'] as const,
  ledger: (orgId: string, partyId: string) => ['loans', orgId, 'ledger', partyId] as const,
}

export async function fetchLoans(orgId: string) {
  return unwrap(await supabase.rpc('loan_balances', { p_org: orgId })).map(toLoanRow)
}

export async function fetchLoanLedger(orgId: string, partyId: string) {
  return toStatementRows(unwrap(await supabase.rpc('loan_ledger', { p_org: orgId, p_party: partyId })))
}
