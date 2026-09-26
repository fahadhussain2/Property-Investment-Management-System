import { useQuery } from '@tanstack/react-query'
import { ChevronRightIcon, LandmarkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { entryKeys, fetchEntries } from '@/features/entries/api'
import { fetchExpiringLeases, leaseKeys } from '@/features/leases/api'
import { EXPIRING_DAYS } from '@/features/leases/rentRoll'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { statusCounts, type StatusFilter } from '@/features/properties/filter'
import { fetchIncomeStatement, reportKeys, type IncomeStatement } from '@/features/reports/api'
import { VOUCHER_TYPES } from '@/lib/labels'
import { formatMoney, isNegative, sum, toMoney, today } from '@/lib/money'
import { fiscalYearLabel, monthOf, presetPeriod } from '@/lib/periods'
import { supabase, unwrap } from '@/lib/supabase'
import { cn } from '@/lib/utils'

function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        {link && (
          <Link to={link.to} className="inline-flex items-center gap-0.5 text-sm hover:underline">
            {link.label} <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** Everything at a glance: money, profit, portfolio, who owes whom, latest entries. */
export function DashboardPage() {
  const { current } = useOrg()
  const m = (x: string) => formatMoney(x, current.currency)
  const fy = presetPeriod('fy', today(), current.fiscal_year_start_month)
  const month = monthOf(today())

  const balances = useQuery({
    queryKey: ['account-balances', current.id],
    queryFn: async () => unwrap(await supabase.rpc('account_balances', { p_org: current.id })),
  })
  const properties = useQuery({ queryKey: propertyKeys.all(current.id), queryFn: () => fetchPropertySummaries(current.id) })
  const fyProfit = useQuery({ queryKey: [...reportKeys.all(current.id), 'income', fy], queryFn: () => fetchIncomeStatement(current.id, fy) })
  const monthProfit = useQuery({ queryKey: [...reportKeys.all(current.id), 'income', month], queryFn: () => fetchIncomeStatement(current.id, month) })
  const expiring = useQuery({ queryKey: leaseKeys.expiring(current.id), queryFn: () => fetchExpiringLeases(current.id) })
  const recent = useQuery({ queryKey: [...entryKeys.all(current.id), { limit: 5 }], queryFn: () => fetchEntries(current.id, { limit: 5 }) })

  if (balances.isPending) return <SectionLoading label="Loading your books…" />
  // Never show a made-up zero for data that failed to load.
  if (balances.isError) return <SectionError error={balances.error} onRetry={() => balances.refetch()} />

  const bal = (key: string) => toMoney(balances.data.find((a) => a.system_key === key)?.balance)
  const money = balances.data.filter((a) => a.subtype === 'cash' || a.subtype === 'bank')
  const totalCash = sum(money.map((a) => toMoney(a.balance)))
  const owedToUs = bal('receivable_buyers')
  const weOwe = sum([bal('payable_sellers'), bal('advances_buyers'), bal('deposits_held')])
  const counts = statusCounts(properties.data ?? [])
  const heldCost = sum((properties.data ?? []).filter((p) => p.status !== 'sold').map((p) => toMoney(p.cost)))

  const profitCard = (label: string, q: { isPending: boolean; isError: boolean; data?: IncomeStatement }, testid: string) => (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn('text-2xl tabular-nums', q.data && isNegative(q.data.net_profit) && 'text-red-700')} data-testid={testid}>
          {q.isPending ? '…' : q.isError || !q.data ? 'Could not load' : m(q.data.net_profit)}
        </CardTitle>
      </CardHeader>
      {q.data && (
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>Buying &amp; selling</span>
          <span className="text-right tabular-nums">{m(q.data.gross_trading_profit)}</span>
          <span>Rent</span>
          <span className="text-right tabular-nums">{m(q.data.rent_income)}</span>
          <span>Other income</span>
          <span className="text-right tabular-nums">{m(q.data.other_income)}</span>
          <span>Expenses</span>
          <span className="text-right tabular-nums">({m(q.data.total_expenses)})</span>
        </CardContent>
      )}
    </Card>
  )

  const statusLink = (f: StatusFilter, label: string) => (
    <Link to={f === 'all' ? '/properties' : `/properties?status=${f}`} className="rounded-lg border p-3 hover:bg-accent" data-testid={`portfolio-${f}`}>
      <div className="text-2xl font-semibold tabular-nums">{properties.isPending ? '…' : counts[f]}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </Link>
  )

  return (
    <>
      <PageHeader title={current.name} description={`Your business today · ${fiscalYearLabel(fy)}`} />
      <div className="grid grid-cols-1 gap-8">
        <Section title="Cash & bank" link={{ to: '/money', label: 'Books' }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {!money.some((a) => a.subtype === 'bank') && (
              <Link
                to="/settings/accounts/money"
                className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm hover:bg-accent sm:col-span-2 lg:col-span-3"
              >
                <LandmarkIcon className="size-5 text-muted-foreground" aria-hidden />
                <span>
                  <span className="font-medium">Add your bank accounts</span>
                  <span className="block text-muted-foreground">So payments and receipts can be recorded against them.</span>
                </span>
              </Link>
            )}
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardHeader>
                <CardDescription>Total cash &amp; bank</CardDescription>
                <CardTitle className="text-3xl tabular-nums" data-testid="total-cash">
                  {m(totalCash)}
                </CardTitle>
              </CardHeader>
            </Card>
            {money.map((a) => (
              <Link key={a.account_id} to={`/money/${a.account_id}`}>
                <Card data-testid={`balance-${a.code}`} className="h-full hover:bg-accent/50">
                  <CardHeader>
                    <CardDescription>{a.name}</CardDescription>
                    <CardTitle className="text-xl tabular-nums">{m(toMoney(a.balance))}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {a.subtype === 'bank' ? 'Bank account' : 'Cash'} · {a.code}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Section>

        <Section title="Profit" link={{ to: '/reports/income-statement', label: 'Income statement' }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {profitCard('This month', monthProfit, 'profit-month')}
            {profitCard(`This year (${fiscalYearLabel(fy)})`, fyProfit, 'profit-fy')}
          </div>
        </Section>

        <Section title="Portfolio" link={{ to: '/properties', label: 'All properties' }}>
          {properties.isError ? (
            <SectionError error={properties.error} onRetry={() => properties.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {statusLink('rented', 'Rented')}
                {statusLink('vacant', 'Vacant')}
                {statusLink('for_sale', 'For sale')}
                {statusLink('under_agreement', 'Under agreement')}
                {statusLink('sold', 'Sold')}
                {statusLink('all', 'All')}
              </div>
              <p className="text-sm text-muted-foreground">
                Invested in properties you hold:{' '}
                <span className="font-medium text-foreground tabular-nums">{properties.isPending ? '…' : m(heldCost)}</span>
              </p>
            </>
          )}
        </Section>

        <Section title="Who owes whom" link={{ to: '/reports/parties', label: 'Details' }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Others owe you</CardDescription>
                <CardTitle className="text-xl tabular-nums" data-testid="owed-to-us">
                  {m(owedToUs)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>You owe others (incl. token money and deposits held)</CardDescription>
                <CardTitle className="text-xl tabular-nums" data-testid="we-owe">
                  {m(weOwe)}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </Section>

        <Section title="Leases ending soon" link={{ to: '/leases?show=ending', label: 'Rent roll' }}>
          {expiring.isPending ? (
            <SectionLoading />
          ) : expiring.isError ? (
            <SectionError error={expiring.error} onRetry={() => expiring.refetch()} />
          ) : expiring.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No lease ends in the next {EXPIRING_DAYS} days.</p>
          ) : (
            <ul className="divide-y rounded-lg border" data-testid="expiring-leases">
              {expiring.data.map((l) => (
                <li key={l.lease_id}>
                  <Link to={`/leases/${l.lease_id}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-accent">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{l.property_code}</span> · {l.tenant_name}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {l.end_date} · {l.days_to_end === 0 ? 'today' : `in ${l.days_to_end} ${l.days_to_end === 1 ? 'day' : 'days'}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Latest entries" link={{ to: '/entries', label: 'Day book' }}>
          {recent.isPending ? (
            <SectionLoading />
          ) : recent.isError ? (
            <SectionError error={recent.error} onRetry={() => recent.refetch()} />
          ) : (recent.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing recorded yet. Start with{' '}
              <Link to="/new/opening" className="underline">
                opening balances
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y rounded-lg border" data-testid="recent-entries">
              {recent.data!.map((v) => (
                <li key={v.id}>
                  <Link to={`/entries/${v.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-accent">
                    <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{new Date(v.date + 'T00:00:00').toLocaleDateString()}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {VOUCHER_TYPES[v.type]} · {v.number}
                    </span>
                    <span className="shrink-0 tabular-nums">{m(toMoney(v.amount))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
