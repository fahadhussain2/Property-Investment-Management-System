import { useQuery } from '@tanstack/react-query'
import { MoneyTable, td, tdNum, th, thNum } from '@/components/MoneyTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { AsOfPicker, ReconcileBanner, ReportShell, useAsOf } from '@/components/ReportShell'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney, sub, sum, toMoney } from '@/lib/money'
import { fetchTrialBalance, reportKeys } from './api'

export function TrialBalancePage() {
  const { current } = useOrg()
  const asOf = useAsOf()
  const q = useQuery({
    queryKey: [...reportKeys.all(current.id), 'trial-balance', asOf.asOf],
    queryFn: () => fetchTrialBalance(current.id, asOf.asOf),
  })
  const m = (x: string) => formatMoney(x, current.currency)
  const rows = (q.data ?? []).map((r) => ({ ...r, debit: toMoney(r.debit), credit: toMoney(r.credit) }))
  const totalDebit = sum(rows.map((r) => r.debit))
  const totalCredit = sum(rows.map((r) => r.credit))

  return (
    <ReportShell
      title="Trial balance"
      subtitle={`As at ${new Date(asOf.asOf + 'T00:00:00').toLocaleDateString()}`}
      description="Every account’s balance. Total debits must equal total credits."
      controls={<AsOfPicker state={asOf} />}
      csv={q.data && {
        name: `trial-balance-${asOf.asOf}`,
        headers: ['Code', 'Account', 'Debit', 'Credit'],
        rows: [...rows.map((r) => [r.code, r.name, r.debit, r.credit]), ['', 'Total', totalDebit, totalCredit]],
      }}
    >
      {q.isPending ? (
        <SectionLoading />
      ) : q.isError ? (
        <SectionError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <ReconcileBanner difference={sub(totalDebit, totalCredit)} currency={current.currency} />
          <MoneyTable testid="trial-balance" minWidth="28rem">
            <thead className="bg-muted/50">
              <tr>
                <th className={th}>Account</th>
                <th className={thNum}>Debit</th>
                <th className={thNum}>Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className={td}>
                    <span className="text-xs text-muted-foreground tabular-nums">{r.code}</span> {r.name}
                  </td>
                  <td className={tdNum}>{r.debit === '0.00' ? '' : m(r.debit)}</td>
                  <td className={tdNum}>{r.credit === '0.00' ? '' : m(r.credit)}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className={td}>Total</td>
                <td className={tdNum}>{m(totalDebit)}</td>
                <td className={tdNum}>{m(totalCredit)}</td>
              </tr>
            </tbody>
          </MoneyTable>
        </>
      )}
    </ReportShell>
  )
}
