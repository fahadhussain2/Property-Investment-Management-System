import { useQuery } from '@tanstack/react-query'
import { MoneyTable, Row, td } from '@/components/MoneyTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { AsOfPicker, ReconcileBanner, ReportShell, useAsOf } from '@/components/ReportShell'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { fetchBalanceSheet, reportKeys } from './api'

export function BalanceSheetPage() {
  const { current } = useOrg()
  const asOf = useAsOf()
  const q = useQuery({
    queryKey: [...reportKeys.all(current.id), 'balance-sheet', asOf.asOf],
    queryFn: () => fetchBalanceSheet(current.id, asOf.asOf),
  })
  const m = (x: string) => formatMoney(x, current.currency)
  const b = q.data
  const asOfText = `As at ${new Date(asOf.asOf + 'T00:00:00').toLocaleDateString()}`

  const csv = b && {
    name: `balance-sheet-${asOf.asOf}`,
    headers: ['Section', 'Code', 'Account', 'Amount'],
    rows: [
      ...b.assets.map((a) => ['Assets', a.code, a.name, a.amount]),
      ['Assets', '', 'Total assets', b.total_assets],
      ...b.liabilities.map((a) => ['Liabilities', a.code, a.name, a.amount]),
      ['Liabilities', '', 'Total liabilities', b.total_liabilities],
      ...b.equity.map((a) => ['Equity', a.code, a.name, a.amount]),
      ['Equity', '', 'Profit to date (not yet closed)', b.current_earnings],
      ['Equity', '', 'Total equity', b.total_equity],
    ],
  }

  const section = (title: string, rows: { code: string; name: string; amount: string }[]) => (
    <>
      <tr><td colSpan={2} className={cn(td, 'pt-3 font-semibold')}>{title}</td></tr>
      {rows.map((a) => (
        <Row key={a.code} indent label={<><span className="text-xs text-muted-foreground tabular-nums">{a.code}</span> {a.name}</>} amount={m(a.amount)} />
      ))}
      {rows.length === 0 && <Row indent label={<span className="text-muted-foreground">None</span>} amount="" />}
    </>
  )

  return (
    <ReportShell title="Balance sheet" subtitle={asOfText} description="What the business owns and owes" controls={<AsOfPicker state={asOf} />} csv={csv || undefined}>
      {q.isPending ? (
        <SectionLoading />
      ) : q.isError ? (
        <SectionError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <ReconcileBanner difference={b!.difference} currency={current.currency} />
          <MoneyTable testid="balance-sheet" minWidth="20rem">
            <tbody>
              {section('Assets: what you own', b!.assets)}
              <Row strong label="Total assets" amount={m(b!.total_assets)} testid="bs-total-assets" />
              {section('Liabilities: what you owe', b!.liabilities)}
              <Row strong label="Total liabilities" amount={m(b!.total_liabilities)} />
              {section('Equity: the owner’s share', b!.equity)}
              <Row indent label="Profit to date (not yet closed)" amount={m(b!.current_earnings)} />
              <Row strong label="Total equity" amount={m(b!.total_equity)} />
            </tbody>
          </MoneyTable>
        </>
      )}
    </ReportShell>
  )
}
