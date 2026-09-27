import { useQuery } from '@tanstack/react-query'
import { MoneyTable, Row, td, tdNum } from '@/components/MoneyTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { PeriodPicker, ReportShell, usePeriod } from '@/components/ReportShell'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney, isNegative, sub } from '@/lib/money'
import { describePeriod } from '@/lib/periods'
import { cn } from '@/lib/utils'
import { fetchIncomeStatement, reportKeys } from './api'

const SUBTYPE_LABEL: Record<string, string> = {
  property_expense: 'Property expenses',
  selling_expense: 'Selling expenses',
  general_expense: 'Office & general',
}

/** Spec §6: trading profit, then rent (expandable by property), then other income, then expenses. */
export function IncomeStatementPage() {
  const { current } = useOrg()
  const period = usePeriod('fy')
  const q = useQuery({
    queryKey: [...reportKeys.all(current.id), 'income', period.period],
    queryFn: () => fetchIncomeStatement(current.id, period.period),
  })
  const m = (x: string) => formatMoney(x, current.currency)
  const less = (x: string) => (x === '0.00' ? m(x) : `(${m(x)})`)
  const r = q.data

  const csv = r && {
    name: `income-statement-${period.period.from}-${period.period.to}`,
    headers: ['Section', 'Line', 'Effect on profit'],
    rows: [
      ['Property trading', 'Property sales', r.property_sales],
      ['Property trading', 'Cost of properties sold', sub('0.00', r.cost_of_properties_sold)],
      ['Property trading', 'Gross profit on property trading', r.gross_trading_profit],
      ...Object.entries(r.rent_income_by_property).map(([code, a]) => ['Rent income', code, a]),
      ['Rent income', 'Total rent income', r.rent_income],
      ...r.other_income_by_account.map((o) => ['Other income', o.name, o.amount]),
      ['Income', 'Total income', r.total_income],
      ...r.expenses_by_account.map((e) => ['Expenses', e.name, sub('0.00', e.amount)]),
      ['Expenses', 'Total expenses', sub('0.00', r.total_expenses)],
      ['Result', 'Net profit', r.net_profit],
    ],
  }

  return (
    <ReportShell
      title="Income statement"
      subtitle={describePeriod(period.period)}
      description="Profit from buying and selling, rent and other income, less expenses"
      controls={<PeriodPicker state={period} />}
      csv={csv || undefined}
    >
      {q.isPending ? (
        <SectionLoading label="Working out your profit…" />
      ) : q.isError ? (
        <SectionError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <MoneyTable testid="income-statement" minWidth="20rem">
          <tbody>
            <tr><td colSpan={2} className={cn(td, 'pt-3 font-semibold')}>Property trading</td></tr>
            <Row indent label="Property sales" amount={m(r!.property_sales)} />
            <Row indent label="Less: cost of properties sold" amount={less(r!.cost_of_properties_sold)} />
            <Row strong label="Gross profit on property trading" amount={m(r!.gross_trading_profit)} testid="is-gross-trading" />

            <tr className="border-t font-semibold" data-testid="is-rent">
              <td className={td}>
                {/* Collapsible on screen; always listed on paper (a closed <details> would print collapsed). */}
                <details className="print:hidden">
                  <summary className="cursor-pointer">Rent income</summary>
                  <ul className="mt-1 grid gap-0.5 pl-4 font-normal" data-testid="is-rent-by-property">
                    {Object.entries(r!.rent_income_by_property).map(([code, a]) => (
                      <li key={code} className="flex justify-between gap-4">
                        <span>{code}</span>
                        <span className="tabular-nums">{m(a)}</span>
                      </li>
                    ))}
                    {Object.keys(r!.rent_income_by_property).length === 0 && <li className="text-muted-foreground">No rent in this period</li>}
                  </ul>
                </details>
                <div className="hidden print:block">
                  Rent income
                  <ul className="mt-1 grid gap-0.5 pl-4 font-normal">
                    {Object.entries(r!.rent_income_by_property).map(([code, a]) => (
                      <li key={code} className="flex justify-between gap-4">
                        <span>{code}</span>
                        <span className="tabular-nums">{m(a)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </td>
              <td className={cn(tdNum, 'align-top')}>{m(r!.rent_income)}</td>
            </tr>

            {r!.other_income_by_account.length > 0 && (
              <>
                <tr><td colSpan={2} className={cn(td, 'pt-3 font-semibold')}>Other income</td></tr>
                {r!.other_income_by_account.map((o) => (
                  <Row key={o.code} indent label={o.name} amount={m(o.amount)} />
                ))}
              </>
            )}
            <Row strong label="Total income" amount={m(r!.total_income)} />

            <tr><td colSpan={2} className={cn(td, 'pt-3 font-semibold')}>Expenses</td></tr>
            {r!.expenses_by_account.map((e) => (
              <Row key={e.code} indent label={<>{e.name} <span className="text-xs text-muted-foreground">{SUBTYPE_LABEL[e.subtype]}</span></>} amount={m(e.amount)} />
            ))}
            {r!.expenses_by_account.length === 0 && <Row indent label={<span className="text-muted-foreground">No expenses in this period</span>} amount="" />}
            <Row strong label="Total expenses" amount={less(r!.total_expenses)} />

            <tr className={cn('border-t-2 text-base font-bold', isNegative(r!.net_profit) ? 'text-red-700 dark:text-red-400' : 'text-emerald-800 dark:text-emerald-400')} data-testid="is-net">
              <td className={cn(td, 'py-3')}>{isNegative(r!.net_profit) ? 'Net loss' : 'Net profit'}</td>
              <td className={cn(tdNum, 'py-3')}>{m(r!.net_profit)}</td>
            </tr>
          </tbody>
        </MoneyTable>
      )}
    </ReportShell>
  )
}
