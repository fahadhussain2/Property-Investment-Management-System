import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MoneyTable, td, tdNum, th, thNum } from '@/components/MoneyTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { ReportShell } from '@/components/ReportShell'
import { PropertyStatusBadge } from '@/components/StatusBadge'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { PROPERTY_STATUS } from '@/lib/labels'
import { formatMoney, sum, toMoney } from '@/lib/money'

/** Every property's full-life result, side by side. */
export function PropertyProfitabilityPage() {
  const { current } = useOrg()
  const q = useQuery({ queryKey: propertyKeys.all(current.id), queryFn: () => fetchPropertySummaries(current.id) })
  const m = (x: string) => formatMoney(x, current.currency)
  const rows = (q.data ?? []).map((p) => ({
    ...p,
    cost: toMoney(p.cost),
    rent: toMoney(p.rent_income),
    other: toMoney(p.other_income),
    exp: toMoney(p.expenses),
    sale: toMoney(p.sale_price),
    profit: toMoney(p.net_profit),
  }))
  const total = (k: 'cost' | 'rent' | 'other' | 'exp' | 'sale' | 'profit') => sum(rows.map((r) => r[k]))

  return (
    <ReportShell
      title="Property profitability"
      subtitle="Whole life of each property, to date"
      description="What each property cost, earned and made. Sold properties include their sale profit."
      csv={q.data && {
        name: 'property-profitability',
        headers: ['Code', 'Name', 'Status', 'Cost', 'Rent', 'Other income', 'Expenses', 'Sale price', 'Net profit', 'Return on cost %'],
        rows: rows.map((r) => [r.code, r.name, PROPERTY_STATUS[r.status].label, r.cost, r.rent, r.other, r.exp, r.sale, r.profit, r.roi_pct]),
      }}
    >
      {q.isPending ? (
        <SectionLoading />
      ) : q.isError ? (
        <SectionError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <MoneyTable testid="profitability" minWidth="52rem">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Property</th>
              <th className={thNum}>Cost</th>
              <th className={thNum}>Rent</th>
              <th className={thNum}>Other income</th>
              <th className={thNum}>Expenses</th>
              <th className={thNum}>Sale price</th>
              <th className={thNum}>Net profit</th>
              <th className={thNum}>Return</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.property_id}>
                <td className={td}>
                  <Link to={`/properties/${r.property_id}`} className="font-medium hover:underline">
                    {r.code}
                  </Link>{' '}
                  <PropertyStatusBadge status={r.status} forSale={r.for_sale} />
                </td>
                <td className={tdNum}>{m(r.cost)}</td>
                <td className={tdNum}>{m(r.rent)}</td>
                <td className={tdNum}>{m(r.other)}</td>
                <td className={tdNum}>{m(r.exp)}</td>
                <td className={tdNum}>{r.sale === '0.00' ? '' : m(r.sale)}</td>
                <td className={tdNum}>{m(r.profit)}</td>
                <td className={tdNum}>{r.roi_pct == null ? '—' : `${r.roi_pct}%`}</td>
              </tr>
            ))}
            <tr className="border-t-2 font-semibold" data-testid="profitability-total">
              <td className={td}>All properties</td>
              <td className={tdNum}>{m(total('cost'))}</td>
              <td className={tdNum}>{m(total('rent'))}</td>
              <td className={tdNum}>{m(total('other'))}</td>
              <td className={tdNum}>{m(total('exp'))}</td>
              <td className={tdNum}>{m(total('sale'))}</td>
              <td className={tdNum}>{m(total('profit'))}</td>
              <td className={tdNum} />
            </tr>
          </tbody>
        </MoneyTable>
      )}
    </ReportShell>
  )
}
