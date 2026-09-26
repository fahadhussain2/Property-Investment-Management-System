import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Field, NativeSelect } from '@/components/Field'
import { LedgerTable, ledgerCsv, type LedgerRow } from '@/components/LedgerTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { PeriodPicker, ReportShell, usePeriod } from '@/components/ReportShell'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { useOrg } from '@/features/org/OrgProvider'
import { ACCOUNT_TYPES } from '@/lib/labels'
import { describePeriod } from '@/lib/periods'
import { fetchLedger, reportKeys } from './api'

const DR_CR: [string, string] = ['Debit', 'Credit']

/** Any account's ledger, for the accountant. */
export function LedgerPage() {
  const { current } = useOrg()
  const period = usePeriod('fy')
  const [params, setParams] = useSearchParams()
  const accountId = params.get('account') ?? ''
  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
  const account = accounts.data?.find((a) => a.id === accountId)
  const ledger = useQuery({
    queryKey: [...reportKeys.all(current.id), 'ledger', accountId, period.period],
    queryFn: () => fetchLedger(current.id, accountId, period.period),
    enabled: !!account,
  })
  const rows = (ledger.data ?? []) as LedgerRow[]
  const pick = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('account', id)
    setParams(next, { replace: true })
  }

  return (
    <ReportShell
      title={account ? `Ledger: ${account.code} ${account.name}` : 'Account ledger'}
      subtitle={describePeriod(period.period)}
      controls={
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Account" name="account" className="print:hidden">
            <NativeSelect id="field-account" value={accountId} onChange={(e) => pick(e.target.value)} className="w-72">
              <option value="">Choose an account…</option>
              {ACCOUNT_TYPES.map((t) => (
                <optgroup key={t.value} label={t.label}>
                  {(accounts.data ?? [])
                    .filter((a) => a.type === t.value)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <PeriodPicker state={period} />
        </div>
      }
      csv={account && ledger.data ? ledgerCsv(`ledger-${account.code}-${period.period.from}-${period.period.to}`, rows, DR_CR) : undefined}
    >
      {accounts.isPending ? (
        <SectionLoading />
      ) : accounts.isError ? (
        <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
      ) : !account ? (
        <p className="text-sm text-muted-foreground">Choose an account to see every entry in it.</p>
      ) : ledger.isPending ? (
        <SectionLoading />
      ) : ledger.isError ? (
        <SectionError error={ledger.error} onRetry={() => ledger.refetch()} />
      ) : (
        <LedgerTable rows={rows} currency={current.currency} columns={DR_CR} testid="account-ledger" />
      )}
    </ReportShell>
  )
}
