import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRightIcon, BellIcon, Building2Icon, ChartBarIcon, HistoryIcon, WalletIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { entryKeys, fetchEntries } from '@/features/entries/api'
import { fetchValuation, holdingKeys } from '@/features/holdings/api'
import { fetchExpiringLeases, fetchRentRoll, leaseKeys } from '@/features/leases/api'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { fetchIncomeStatement, fetchPartyBalances, reportKeys } from '@/features/reports/api'
import { today } from '@/lib/money'
import { fiscalYearLabel, monthOf, presetPeriod } from '@/lib/periods'
import { supabase, unwrap } from '@/lib/supabase'
import { dashboardKeys, fetchMonthlyPerformance } from './api'
import { AssetTiles } from './AssetTiles'
import { CashAccountsBody, LatestEntriesBody, OwedBody, PortfolioBody, ProfitMixBody } from './Cards'
import { HeadlineTiles } from './HeadlineTiles'
import {
  assetClasses,
  attention,
  cashAccounts,
  cashByKind,
  mapQuery,
  owed,
  portfolio,
  profitMix,
  rentOverdue,
  totalInvested,
  type QueryLike,
} from './model'
import { NeedsAttention } from './NeedsAttention'
import { Block, Loaded, Skeleton } from './parts'
import { PerformanceCard } from './PerformanceCard'
import { formatDate } from '@/lib/dates'

/** Spec 002: key figures, what we own, the monthly trend, what needs attention, then the detail blocks. */
export function DashboardPage() {
  const { current, canWrite } = useOrg()
  const org = current.id
  const fy = presetPeriod('fy', today(), current.fiscal_year_start_month)
  const month = monthOf(today())

  // Each block has its own query, so one failure never blanks the page.
  const balances = useQuery({
    queryKey: ['account-balances', org],
    queryFn: async () => unwrap(await supabase.rpc('account_balances', { p_org: org })),
  })
  const monthly = useQuery({ queryKey: dashboardKeys.monthly(org), queryFn: () => fetchMonthlyPerformance(org) })
  const fyProfit = useQuery({ queryKey: [...reportKeys.all(org), 'income', fy], queryFn: () => fetchIncomeStatement(org, fy) })
  const monthProfit = useQuery({ queryKey: [...reportKeys.all(org), 'income', month], queryFn: () => fetchIncomeStatement(org, month) })
  const properties = useQuery({ queryKey: propertyKeys.all(org), queryFn: () => fetchPropertySummaries(org) })
  const roll = useQuery({ queryKey: leaseKeys.roll(org), queryFn: () => fetchRentRoll(org) })
  const expiring = useQuery({ queryKey: leaseKeys.expiring(org), queryFn: () => fetchExpiringLeases(org) })
  const parties = useQuery({ queryKey: dashboardKeys.partyBalances(org), queryFn: () => fetchPartyBalances(org) })
  const recent = useQuery({ queryKey: [...entryKeys.all(org), { limit: 5 }], queryFn: () => fetchEntries(org, { limit: 5 }) })
  const valuation = useQuery({ queryKey: holdingKeys.valuation(org), queryFn: () => fetchValuation(org) })

  // Derived views keep each query's own loading/error state.
  const cash = mapQuery(balances, cashAccounts)
  const portfolioQ = mapQuery(properties, portfolio)
  const overdueQ = mapQuery(roll, rentOverdue)
  const assetsQ = mapQuery(valuation, assetClasses)
  const invested: QueryLike<ReturnType<typeof totalInvested>> = {
    isPending: portfolioQ.isPending || assetsQ.isPending,
    isError: portfolioQ.isError || assetsQ.isError,
    error: portfolioQ.error ?? assetsQ.error,
    refetch: () => Promise.all([properties.refetch(), valuation.refetch()]),
    data: portfolioQ.data && assetsQ.data ? totalInvested(portfolioQ.data, assetsQ.data) : undefined,
  }
  const needs: QueryLike<ReturnType<typeof attention>> = {
    isPending: roll.isPending || expiring.isPending || parties.isPending,
    isError: roll.isError || expiring.isError || parties.isError,
    error: roll.error ?? expiring.error ?? parties.error,
    refetch: () => Promise.all([roll.refetch(), expiring.refetch(), parties.refetch()]),
    data: roll.data && expiring.data && parties.data ? attention(roll.data, expiring.data, parties.data) : undefined,
  }
  const asOf = monthly.data?.at(-1)?.month_end
  const codes = new Map((properties.data ?? []).map((p) => [p.property_id, p.code]))
  const currency = current.currency

  return (
    <>
      <PageHeader
        title={current.name}
        description={`Your business today · ${fiscalYearLabel(fy)}${asOf ? ` · as of ${formatDate(asOf)}` : ''}`}
      />
      <div className="grid grid-cols-1 gap-4">
        <HeadlineTiles
          currency={currency}
          fyLabel={fiscalYearLabel(fy)}
          cash={mapQuery(cash, cashByKind)}
          monthly={monthly}
          fy={fyProfit}
          month={monthProfit}
          invested={invested}
          overdue={overdueQ}
        />
        <AssetTiles currency={currency} portfolio={portfolioQ} assets={assetsQ} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <PerformanceCard query={monthly} currency={currency} canWrite={canWrite} />
          <Block title="Needs attention" icon={BellIcon} action={needs.data && needs.data.total > 0 ? <Badge n={needs.data.total} /> : undefined}>
            <Loaded query={needs} skeleton={<Skeleton className="h-56" />}>
              {(a) => <NeedsAttention data={a} currency={currency} />}
            </Loaded>
          </Block>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Block title="Portfolio" icon={Building2Icon} link={{ to: '/properties', label: 'All properties' }}>
            <Loaded query={portfolioQ} skeleton={<Skeleton className="h-40" />}>
              {(p) => <PortfolioBody data={p} />}
            </Loaded>
          </Block>
          <Block title="Where this year's profit came from" icon={ChartBarIcon} description={fiscalYearLabel(fy)}>
            <Loaded query={fyProfit} skeleton={<Skeleton className="h-40" />}>
              {(is) => <ProfitMixBody rows={profitMix(is)} net={is.net_profit} currency={currency} />}
            </Loaded>
          </Block>
          <Block title="Cash by account" icon={WalletIcon} link={{ to: '/money', label: 'Books' }} className="sm:col-span-2 lg:col-span-1">
            <Loaded query={cash} skeleton={<Skeleton className="h-40" />}>
              {(c) => <CashAccountsBody rows={c.rows} total={c.total} hasBank={c.hasBank} currency={currency} />}
            </Loaded>
          </Block>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Block title="Who owes whom" icon={ArrowLeftRightIcon} link={{ to: '/reports/parties', label: 'Details' }}>
            <Loaded query={balances} skeleton={<Skeleton className="h-32" />}>
              {(b) => <OwedBody data={owed(b)} currency={currency} />}
            </Loaded>
          </Block>
          <Block title="Latest entries" icon={HistoryIcon} className="lg:col-span-2">
            <Loaded query={recent} skeleton={<Skeleton className="h-40" />}>
              {(entries) => <LatestEntriesBody entries={entries} codes={codes} currency={currency} />}
            </Loaded>
          </Block>
        </div>
      </div>
    </>
  )
}

function Badge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-red-600/10 px-2 py-0.5 text-xs font-semibold text-red-700 tabular-nums dark:text-red-400" aria-label={`${n} items`}>
      {n}
    </span>
  )
}
