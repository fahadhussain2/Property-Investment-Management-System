import { useQuery } from '@tanstack/react-query'
import { ChevronRightIcon, LandmarkIcon, WalletIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney, sum } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MONEY_KINDS, moneyAccounts, moneyKindOf } from './filter'

/** Cash & Bank: the money accounts, all or one kind (`?kind=cash|bank`); each opens its cash book / bank book. */
export function MoneyPage() {
  const { current } = useOrg()
  const [params, setParams] = useSearchParams()
  const kind = moneyKindOf(params.get('kind'))
  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
  if (accounts.isPending) return <SectionLoading />
  if (accounts.isError) return <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
  const money = moneyAccounts(accounts.data, kind)
  const label = kind === 'cash' ? 'Cash total' : kind === 'bank' ? 'Bank total' : 'Total'
  return (
    <>
      <PageHeader
        title="Cash & Bank"
        description={`${label} ${formatMoney(sum(money.map((a) => a.balance)), current.currency)}. Open an account to see its book.`}
        actions={
          <Link to="/settings/accounts/money" className="text-sm underline">
            Manage accounts
          </Link>
        }
      />
      {/* The dashboard's Cash and Bank tiles open this page on their kind; the choice stays in the URL. */}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show accounts">
        {MONEY_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => setParams(k.value === 'all' ? {} : { kind: k.value }, { replace: true })}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              kind === k.value ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      {money.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="money-empty">
          No {kind === 'all' ? 'cash or bank' : kind} accounts yet.{' '}
          <Link to="/settings/accounts/money" className="underline">
            Add one
          </Link>
        </p>
      ) : (
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
      )}
    </>
  )
}
