import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { formatMoney, isNegative } from '@/lib/money'
import { cn } from '@/lib/utils'
import { isQuiet, lastMonths, toChartPoints, type ChartPoint, type MonthRow, type QueryLike } from './model'
import { Block, Loaded, MoreLink, Skeleton } from './parts'

const PerformanceChart = lazy(() => import('./PerformanceChart'))

const WIDE = '(min-width: 640px)'

/** Phones always get 6 months; wider screens default to 12 and can switch (kept in ?range=). */
function useWide() {
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(WIDE).matches)
  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

export function PerformanceCard({ query, currency, canWrite }: { query: QueryLike<MonthRow[]>; currency: string; canWrite: boolean }) {
  const wide = useWide()
  const [params, setParams] = useSearchParams()
  const [asTable, setAsTable] = useState(false)
  const range = wide && params.get('range') !== '6' ? 12 : 6
  const setRange = (n: 6 | 12) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (n === 12) next.delete('range')
        else next.set('range', '6')
        return next
      },
      { replace: true },
    )

  const action = (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {wide && (
        <div role="group" aria-label="Range" className="flex rounded-lg bg-muted p-0.5">
          {([6, 12] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={range === n}
              onClick={() => setRange(n)}
              className={cn(
                'h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground',
                range === n && 'bg-background text-foreground shadow-sm',
              )}
            >
              {n} months
            </button>
          ))}
        </div>
      )}
      <Button size="sm" variant="outline" aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}>
        {asTable ? 'Show chart' : 'Show as table'}
      </Button>
    </div>
  )

  return (
    <Block
      title="Income, expenses and profit"
      description="By month. Income includes profit on properties sold."
      action={action}
      className="lg:col-span-2"
    >
      <Loaded query={query} skeleton={<Skeleton className="h-72" />}>
        {(rows) => {
          const shown = lastMonths(rows, range)
          if (isQuiet(shown)) {
            return (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No income or expenses recorded in the last {range} months.
                {canWrite && (
                  <>
                    {' '}
                    <Link to="/new" className="underline">
                      Record an entry
                    </Link>
                    .
                  </>
                )}
              </p>
            )
          }
          const points = toChartPoints(shown)
          return (
            <>
              {!asTable && (
                <div className="grid grid-cols-1 gap-3 print:hidden">
                  <Legend />
                  <Suspense fallback={<Skeleton className="h-64" />}>
                    <PerformanceChart points={points} currency={currency} />
                  </Suspense>
                </div>
              )}
              {/* The table is the accessible view, and it is what prints. */}
              <div className={cn('overflow-x-auto', !asTable && 'hidden print:block')}>
                <MonthTable points={points} currency={currency} />
              </div>
            </>
          )
        }}
      </Loaded>
      <MoreLink to="/reports/income-statement" className="mt-auto self-start print:hidden">
        Income statement
      </MoreLink>
    </Block>
  )
}

function Legend() {
  const item = (label: string, swatch: string) => (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={swatch} />
      {label}
    </span>
  )
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
      {item('Income', 'size-2.5 rounded-[3px] bg-chart-income')}
      {item('Expenses', 'size-2.5 rounded-[3px] bg-chart-expense')}
      {item('Net profit', 'h-0.5 w-3.5 rounded bg-chart-profit')}
    </div>
  )
}

function MonthTable({ points, currency }: { points: ChartPoint[]; currency: string }) {
  const m = (x: string) => formatMoney(x, currency)
  return (
    <table className="w-full text-sm" data-testid="performance-table">
      <caption className="sr-only">Income, expenses and net profit by month</caption>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="py-2 pr-3 font-medium">Month</th>
          <th className="py-2 pr-3 text-right font-medium">Income</th>
          <th className="py-2 pr-3 text-right font-medium">Expenses</th>
          <th className="py-2 text-right font-medium">Net profit</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {[...points].reverse().map((p) => (
          <tr key={p.month_start} className="border-b last:border-0">
            <th scope="row" className="py-2 pr-3 text-left font-normal whitespace-nowrap">
              {p.longLabel}
            </th>
            <td className="py-2 pr-3 text-right whitespace-nowrap">{m(p.total_income)}</td>
            <td className="py-2 pr-3 text-right whitespace-nowrap">{m(p.total_expenses)}</td>
            <td className={cn('py-2 text-right font-medium whitespace-nowrap', isNegative(p.net_profit) && 'text-red-700 dark:text-red-400')}>
              {m(p.net_profit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
