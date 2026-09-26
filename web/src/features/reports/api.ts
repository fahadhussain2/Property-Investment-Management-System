import { supabase, unwrap } from '@/lib/supabase'
import type { Money } from '@/lib/money'
import type { Period } from '@/lib/periods'

/** Shapes of the jsonb reports (money values are 2-dp strings, see reports SQL). */
export type IncomeStatement = {
  from: string
  to: string
  property_sales: Money
  cost_of_properties_sold: Money
  gross_trading_profit: Money
  rent_income: Money
  rent_income_by_property: Record<string, Money>
  other_income: Money
  other_income_by_account: { code: string; name: string; amount: Money }[]
  total_income: Money
  property_expenses: Money
  selling_expenses: Money
  general_expenses: Money
  expenses_by_account: { code: string; name: string; subtype: string; amount: Money }[]
  total_expenses: Money
  net_profit: Money
}

type BsRow = { code: string; name: string; amount: Money }
export type BalanceSheet = {
  as_of: string
  assets: BsRow[]
  total_assets: Money
  liabilities: BsRow[]
  total_liabilities: Money
  equity: BsRow[]
  current_earnings: Money
  total_equity: Money
  difference: Money
}

export const reportKeys = {
  all: (orgId: string) => ['reports', orgId] as const,
}

export async function fetchIncomeStatement(orgId: string, p: Period) {
  return unwrap(await supabase.rpc('income_statement', { p_org: orgId, p_from: p.from, p_to: p.to })) as unknown as IncomeStatement
}

export async function fetchBalanceSheet(orgId: string, asOf: string) {
  return unwrap(await supabase.rpc('balance_sheet', { p_org: orgId, p_as_of: asOf })) as unknown as BalanceSheet
}

export async function fetchTrialBalance(orgId: string, asOf: string) {
  return unwrap(await supabase.rpc('trial_balance', { p_org: orgId, p_as_of: asOf }))
}

export async function fetchLedger(orgId: string, accountId: string, p: Period) {
  return unwrap(await supabase.rpc('account_ledger', { p_org: orgId, p_account: accountId, p_from: p.from, p_to: p.to }))
}

export async function fetchPartyBalances(orgId: string) {
  return unwrap(await supabase.rpc('party_balances', { p_org: orgId }))
}

export async function fetchPartyLedger(orgId: string, partyId: string, p: Period) {
  return unwrap(await supabase.rpc('party_ledger', { p_org: orgId, p_party: partyId, p_from: p.from, p_to: p.to }))
}

export async function fetchPropertyBreakdown(orgId: string, propertyId: string) {
  return unwrap(await supabase.rpc('property_breakdown', { p_org: orgId, p_property: propertyId }))
}
