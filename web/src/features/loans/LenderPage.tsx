import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon, PrinterIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { LedgerTable } from '@/components/LedgerTable'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { Button, buttonVariants } from '@/components/ui/button'
import { useOrg } from '@/features/org/OrgProvider'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { fetchLoanLedger, fetchLoans, loanKeys } from './api'

const COLS: [string, string] = ['Repaid', 'Borrowed']

const Figure = ({ label, value, testid }: { label: string; value: string; testid: string }) => (
  <div className="rounded-xl border bg-card p-4">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold tabular-nums sm:text-2xl" data-testid={testid}>
      {value}
    </div>
  </div>
)

/** One lender: what was borrowed, repaid and is still owed, and the statement with the balance after every line. */
export function LenderPage() {
  const { id = '' } = useParams()
  const { current, canWrite } = useOrg()
  const list = useQuery({ queryKey: loanKeys.list(current.id), queryFn: () => fetchLoans(current.id) })
  const ledger = useQuery({ queryKey: loanKeys.ledger(current.id, id), queryFn: () => fetchLoanLedger(current.id, id) })
  const m = (x: string) => formatMoney(x, current.currency)
  const lender = list.data?.find((r) => r.party_id === id)

  if (list.isPending) return <SectionLoading label="Loading…" />
  if (list.isError) return <SectionError error={list.error} onRetry={() => list.refetch()} />
  if (!lender) {
    return (
      <>
        <PageHeader title="Lender not found" />
        <Link to="/loans" className="text-sm underline">
          Back to loans
        </Link>
      </>
    )
  }
  return (
    <>
      <Link to="/loans" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeftIcon className="size-4" aria-hidden /> Loans
      </Link>
      <div className="print:hidden">
        <PageHeader
          title={lender.name}
          description="Not income: money borrowed from this lender."
          actions={
            canWrite && (
              <>
                <Link to={`/new/loan_received?party_id=${id}`} className={buttonVariants()}>
                  Loan received
                </Link>
                <Link to={`/new/loan_repayment?party_id=${id}`} className={buttonVariants({ variant: 'outline' })}>
                  Loan repayment
                </Link>
              </>
            )
          }
        />
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Figure label="Borrowed" value={m(lender.borrowed)} testid="lender-borrowed" />
          <Figure label="Repaid" value={m(lender.repaid)} testid="lender-repaid" />
          <Figure label="Owed now" value={m(lender.owed)} testid="lender-owed-now" />
        </div>
      </div>
      <section className="grid grid-cols-1 gap-3">
        <div className="hidden print:block">
          <div className="text-sm">{current.name}</div>
          <h1 className="text-xl font-semibold">Loan statement · {lender.name}</h1>
          <div className="text-sm">All entries · Printed {formatDateTime(new Date())}</div>
        </div>
        <div className="flex items-center justify-between gap-2 print:hidden">
          <h2 className="text-sm font-semibold text-muted-foreground">Statement</h2>
          {ledger.data && (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon /> Print
            </Button>
          )}
        </div>
        {ledger.isPending ? (
          <SectionLoading />
        ) : ledger.isError ? (
          <SectionError error={ledger.error} onRetry={() => ledger.refetch()} />
        ) : (
          <>
            <LedgerTable rows={ledger.data} currency={current.currency} columns={COLS} testid="loan-statement" />
            <p className="text-xs text-muted-foreground">Balance: the amount still owed to this lender after each line.</p>
          </>
        )}
      </section>
    </>
  )
}
