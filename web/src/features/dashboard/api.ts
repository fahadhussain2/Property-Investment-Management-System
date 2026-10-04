import { reportKeys } from '@/features/reports/api'
import { supabase, unwrap } from '@/lib/supabase'
import { toCashMonth, toMonthRow } from './model'

/** Under ['reports', orgId], so invalidateAfterPosting() refreshes it after every post, edit or void. */
export const dashboardKeys = {
  monthly: (orgId: string) => [...reportKeys.all(orgId), 'monthly-performance'] as const,
  partyBalances: (orgId: string) => [...reportKeys.all(orgId), 'party-balances'] as const,
}

/** Always 12 months: the 6-month view is the last six of the same (cached) rows. */
export const PERFORMANCE_MONTHS = 12

export async function fetchMonthlyPerformance(orgId: string) {
  return unwrap(await supabase.rpc('monthly_performance', { p_org: orgId, p_months: PERFORMANCE_MONTHS })).map((r) => ({ ...toMonthRow(r), ...toCashMonth(r) }))
}
