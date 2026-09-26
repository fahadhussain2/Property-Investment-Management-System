import { useQuery } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { LedgerTable, ledgerCsv, type LedgerRow } from '@/components/LedgerTable'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { PeriodPicker, ReportShell, usePeriod } from '@/components/ReportShell'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchLedger, reportKeys } from '@/features/reports/api'
import { describePeriod } from '@/lib/periods'

const IN_OUT: [string, string] = ['Money in', 'Money out']

/** The digital cash book / bank book: opening, every movement, running balance. */
export function MoneyBookPage() {
  const { accountId = '' } = useParams()
  const { current } = useOrg()
  const period = usePeriod('month')
  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
  const account = accounts.data?.find((a) => a.id === accountId)
  const ledger = useQuery({
    queryKey: [...reportKeys.all(current.id), 'ledger', accountId, period.period],
    queryFn: () => fetchLedger(current.id, accountId, period.period),
    enabled: !!account,
  })

  if (accounts.isPending) return <SectionLoading />
  if (accounts.isError) return <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
  if (!account || (account.subtype !== 'cash' && account.subtype !== 'bank')) {
    return <PageHeader title="Account not found" />
  }
  const book = account.subtype === 'bank' ? 'Bank book' : 'Cash book'
  const rows = (ledger.data ?? []) as LedgerRow[]
  return (
    <>
      <Link to="/money" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeftIcon className="size-4" aria-hidden /> Cash & Bank
      </Link>
      <ReportShell
        title={`${book}: ${account.name}`}
        subtitle={describePeriod(period.period)}
        controls={<PeriodPicker state={period} />}
        csv={ledger.data ? ledgerCsv(`${book}-${account.name}-${period.period.from}-${period.period.to}`, rows, IN_OUT) : undefined}
      >
        {ledger.isPending ? (
          <SectionLoading label="Loading the book…" />
        ) : ledger.isError ? (
          <SectionError error={ledger.error} onRetry={() => ledger.refetch()} />
        ) : (
          <LedgerTable rows={rows} currency={current.currency} columns={IN_OUT} testid="money-book" />
        )}
      </ReportShell>
    </>
  )
}
