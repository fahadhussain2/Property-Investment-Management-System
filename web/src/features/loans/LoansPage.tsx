import { useQuery } from '@tanstack/react-query'
import { ChevronRightIcon, HandCoinsIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { buttonVariants } from '@/components/ui/button'
import { useOrg } from '@/features/org/OrgProvider'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { fetchLoans, loanKeys } from './api'
import { splitLoans, totalOwed, type LoanRow } from './model'

function LenderCard({ r, currency }: { r: LoanRow; currency: string }) {
  const m = (x: string) => formatMoney(x, currency)
  return (
    <li>
      <Link to={`/loans/${r.party_id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-accent/50" data-testid="lender-card">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{r.name}</span>
          <span className="block text-lg font-semibold tabular-nums sm:text-xl" data-testid="lender-owed">
            {m(r.owed)}
          </span>
          <span className="block text-xs text-muted-foreground">
            Borrowed {m(r.borrowed)} · Repaid {m(r.repaid)}
          </span>
          {r.last_date && <span className="block text-xs text-muted-foreground">Last entry {formatDate(r.last_date)}</span>}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  )
}

/** Loans (spec 008): money borrowed from people and what is still owed. A loan is a debt, never income. */
export function LoansPage() {
  const { current, canWrite } = useOrg()
  const list = useQuery({ queryKey: loanKeys.list(current.id), queryFn: () => fetchLoans(current.id) })
  const m = (x: string) => formatMoney(x, current.currency)
  const { open, settled, unassigned } = splitLoans(list.data ?? [])
  return (
    <>
      <PageHeader
        title="Loans"
        description="Money borrowed from people and what is still owed. A loan is a debt: it is not income, and repaying it is not an expense."
        actions={
          canWrite && (
            <>
              <Link to="/new/loan_received" className={buttonVariants()}>
                Loan received
              </Link>
              <Link to="/new/loan_repayment" className={buttonVariants({ variant: 'outline' })}>
                Loan repayment
              </Link>
            </>
          )
        }
      />
      {list.isPending ? (
        <SectionLoading />
      ) : list.isError ? (
        <SectionError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.every((r) => r.party_id !== null && r.last_date === null) ? (
        <EmptyState icon={HandCoinsIcon} title="No loans yet">
          When someone lends the business money, record it here.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">Owed now</div>
            <div className="text-lg font-semibold tabular-nums sm:text-2xl" data-testid="loans-owed">
              {m(totalOwed(list.data))}
            </div>
          </div>
          {open.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="lender-list">
              {open.map((r) => (
                <LenderCard key={r.party_id} r={r} currency={current.currency} />
              ))}
            </ul>
          )}
          {unassigned && (
            <p className="rounded-lg border p-3 text-sm" data-testid="loans-unassigned">
              Not assigned to a lender: {m(unassigned.owed)}. A journal entry used Loans Payable without naming a lender.
            </p>
          )}
          {settled.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Settled</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="lender-settled">
                {settled.map((r) => (
                  <LenderCard key={r.party_id} r={r} currency={current.currency} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}
