import { useQuery } from '@tanstack/react-query'
import { MoneyTable, Row, td } from '@/components/MoneyTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchPropertyBreakdown } from '@/features/reports/api'
import { formatMoney, sum, toMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { PropertySummary } from './api'

/** How the property's cost and profit are made up (rows add up to the KPIs, proven in pgTAP). */
export function PropertyBreakdown({ propertyId, summary }: { propertyId: string; summary: PropertySummary }) {
  const { current } = useOrg()
  const q = useQuery({
    queryKey: ['properties', current.id, propertyId, 'breakdown'],
    queryFn: () => fetchPropertyBreakdown(current.id, propertyId),
  })
  const m = (x: string) => formatMoney(x, current.currency)
  if (q.isPending) return <SectionLoading />
  if (q.isError) return <SectionError error={q.error} onRetry={() => q.refetch()} />
  const rows = q.data.map((r) => ({ ...r, amount: toMoney(r.amount) }))
  const of = (s: string) => rows.filter((r) => r.section === s)
  const cost = of('cost')
  const profitRows = [...of('sale'), ...of('cost_of_sale'), ...of('income'), ...of('expense')]
  const head = (t: string) => (
    <tr>
      <td colSpan={2} className={cn(td, 'pt-3 font-semibold')}>
        {t}
      </td>
    </tr>
  )
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="property-breakdown">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">How the cost is made up</h2>
        <MoneyTable minWidth="16rem">
          <tbody>
            {cost.map((r) => (
              <Row key={r.label} label={r.label} amount={m(r.amount)} />
            ))}
            {cost.length === 0 && <Row label={<span className="text-muted-foreground">No cost recorded yet</span>} amount="" />}
            <Row strong label="Total cost" amount={m(sum(cost.map((r) => r.amount)))} testid="breakdown-cost-total" />
          </tbody>
        </MoneyTable>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">How the profit is made up</h2>
        <MoneyTable minWidth="16rem">
          <tbody>
            {of('sale').length > 0 && head('Sale')}
            {of('sale').map((r) => <Row key={r.label} indent label={r.label} amount={m(r.amount)} />)}
            {of('cost_of_sale').map((r) => <Row key={r.label} indent label={`Less: ${r.label.toLowerCase()}`} amount={`(${m(r.amount)})`} />)}
            {of('income').length > 0 && head('Income')}
            {of('income').map((r) => <Row key={r.label} indent label={r.label} amount={m(r.amount)} />)}
            {of('expense').length > 0 && head('Expenses')}
            {of('expense').map((r) => <Row key={r.label} indent label={r.label} amount={`(${m(r.amount)})`} />)}
            {profitRows.length === 0 && <Row label={<span className="text-muted-foreground">No income or expenses yet</span>} amount="" />}
            <Row strong label="Net profit" amount={m(toMoney(summary.net_profit))} testid="breakdown-profit" />
          </tbody>
        </MoneyTable>
      </section>
    </div>
  )
}
