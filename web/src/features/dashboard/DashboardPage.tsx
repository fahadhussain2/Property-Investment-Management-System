import { useQuery } from '@tanstack/react-query'
import { LandmarkIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney, sum, toMoney } from '@/lib/money'
import { supabase, unwrap } from '@/lib/supabase'

/** M2 version: cash position only. The full dashboard (portfolio, profit) arrives in M5. */
export function DashboardPage() {
  const { current } = useOrg()
  const balances = useQuery({
    queryKey: ['account-balances', current.id],
    queryFn: async () => unwrap(await supabase.rpc('account_balances', { p_org: current.id })),
  })

  return (
    <>
      <PageHeader title={current.name} description="Your cash position today" />
      {balances.isPending ? (
        <SectionLoading label="Loading balances…" />
      ) : balances.isError ? (
        <SectionError error={balances.error} onRetry={() => balances.refetch()} />
      ) : (
        <CashCards rows={balances.data} currency={current.currency} />
      )}
    </>
  )
}

type BalanceRow = { account_id: string; code: string; name: string; subtype: string; balance: number }

function CashCards({ rows, currency }: { rows: BalanceRow[]; currency: string }) {
  const money = rows.filter((a) => a.subtype === 'cash' || a.subtype === 'bank')
  const total = sum(money.map((a) => toMoney(a.balance)))
  const hasBank = money.some((a) => a.subtype === 'bank')
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {!hasBank && (
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
            {formatMoney(total, currency)}
          </CardTitle>
        </CardHeader>
      </Card>
      {money.map((a) => (
        <Card key={a.account_id} data-testid={`balance-${a.code}`}>
          <CardHeader>
            <CardDescription>{a.name}</CardDescription>
            <CardTitle className="text-xl tabular-nums">{formatMoney(toMoney(a.balance), currency)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {a.subtype === 'bank' ? 'Bank account' : 'Cash'} · {a.code}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
