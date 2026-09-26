import { useQuery } from '@tanstack/react-query'
import { ChevronRightIcon, LandmarkIcon, WalletIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney, isZero, sum } from '@/lib/money'

/** Cash & Bank: every money account; each opens its cash book / bank book. */
export function MoneyPage() {
  const { current } = useOrg()
  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
  if (accounts.isPending) return <SectionLoading />
  if (accounts.isError) return <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
  // Hidden accounts are shown only if they still hold money (they cannot, by rule, but never hide money).
  const money = accounts.data.filter((a) => (a.subtype === 'cash' || a.subtype === 'bank') && (a.is_active || !isZero(a.balance)))
  return (
    <>
      <PageHeader
        title="Cash & Bank"
        description={`Total ${formatMoney(sum(money.map((a) => a.balance)), current.currency)}. Open an account to see its book.`}
        actions={
          <Link to="/settings/accounts/money" className="text-sm underline">
            Manage accounts
          </Link>
        }
      />
      <ul className="divide-y rounded-lg border" data-testid="money-list">
        {money.map((a) => {
          const Icon = a.subtype === 'bank' ? LandmarkIcon : WalletIcon
          return (
            <li key={a.id}>
              <Link to={`/money/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {a.name} {!a.is_active && <Badge variant="outline">Hidden</Badge>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {a.subtype === 'bank' ? 'Bank book' : 'Cash book'} · {a.code}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(a.balance, current.currency)}</span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
