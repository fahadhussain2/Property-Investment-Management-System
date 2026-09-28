import { TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { IncomeStatement } from '@/features/reports/api'
import { formatMoney, isNegative, isZero, type Money } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { MonthRow, Portfolio, QueryLike as Q } from './model'
import { Polyline } from './Sparkline'
import { Loaded, Skeleton } from './parts'


/**
 * A tile is a plain box whose label is a link stretched over the whole tile (after:absolute).
 * Not a <Link> around everything: a "Try again" button inside a link is invalid and would navigate.
 */
function Tile({ label, to, alert, children }: { label: ReactNode; to: string; alert?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors has-[a:hover]:bg-accent/50',
        alert && 'ring-2 ring-red-600/70 dark:ring-red-400/70',
      )}
    >
      <Link
        to={to}
        className={cn(
          'flex items-center gap-1.5 text-sm font-medium text-muted-foreground after:absolute after:inset-0 after:rounded-xl',
          alert && 'text-red-700 dark:text-red-400',
        )}
      >
        {label}
      </Link>
      {children}
    </div>
  )
}

const Value = ({ children, testid, negative }: { children: ReactNode; testid?: string; negative?: boolean }) => (
  <span data-testid={testid} className={cn('text-lg leading-tight font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl', negative && 'text-red-700 dark:text-red-400')}>
    {children}
  </span>
)
const Sub = ({ children }: { children: ReactNode }) => <span className="text-xs text-muted-foreground sm:text-sm">{children}</span>

const tileSkeleton = <Skeleton className="h-12" />

export function HeadlineTiles({
  currency,
  fyLabel,
  cash,
  monthly,
  fy,
  month,
  portfolio,
  overdue,
}: {
  currency: string
  fyLabel: string
  cash: Q<{ total: Money; count: number }>
  monthly: Q<MonthRow[]>
  fy: Q<IncomeStatement>
  month: Q<IncomeStatement>
  portfolio: Q<Portfolio>
  overdue: Q<{ total: Money; tenants: number; months: number }>
}) {
  const m = (x: Money) => formatMoney(x, currency)
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Cash & bank" to="/money">
        <Loaded query={cash} skeleton={tileSkeleton}>
          {(c) => (
            <>
              <Value testid="total-cash" negative={isNegative(c.total)}>
                {m(c.total)}
              </Value>
              <span className="flex items-center justify-between gap-2">
                <Sub>
                  {c.count} {c.count === 1 ? 'account' : 'accounts'}
                </Sub>
                {monthly.data && (
                  <span className="hidden sm:block">
                    <Polyline values={lastSix(monthly.data)} />
                  </span>
                )}
              </span>
            </>
          )}
        </Loaded>
      </Tile>

      <Tile label={`Net profit · ${fyLabel}`} to="/reports/income-statement">
        <Loaded query={fy} skeleton={tileSkeleton}>
          {(is) => (
            <>
              <Value testid="profit-fy" negative={isNegative(is.net_profit)}>
                {m(is.net_profit)}
              </Value>
              <Sub>
                This month{' '}
                <span data-testid="profit-month" className="font-medium text-foreground tabular-nums">
                  {month.isPending ? '…' : month.isError || !month.data ? 'could not load' : m(month.data.net_profit)}
                </span>
              </Sub>
            </>
          )}
        </Loaded>
      </Tile>

      <Tile label="Invested in properties held" to="/properties">
        <Loaded query={portfolio} skeleton={tileSkeleton}>
          {(p) => (
            <>
              <Value testid="held-cost">{m(p.heldCost)}</Value>
              <Sub>
                {p.held} {p.held === 1 ? 'property' : 'properties'} at cost
              </Sub>
            </>
          )}
        </Loaded>
      </Tile>

      <Loaded query={overdue} skeleton={<Tile label="Rent overdue" to="/leases">{tileSkeleton}</Tile>}>
        {(o) =>
          isZero(o.total) ? (
            <Tile label="Rent overdue" to="/leases">
              <Value testid="rent-overdue">{m(o.total)}</Value>
              <Sub>No rent overdue</Sub>
            </Tile>
          ) : (
            <Tile
              alert
              to="/leases"
              label={
                <>
                  <TriangleAlertIcon className="size-4" aria-hidden /> Rent overdue
                </>
              }
            >
              <Value testid="rent-overdue">{m(o.total)}</Value>
              <Sub>
                {o.tenants} {o.tenants === 1 ? 'tenant' : 'tenants'} · {o.months} {o.months === 1 ? 'month' : 'months'} unpaid
              </Sub>
            </Tile>
          )
        }
      </Loaded>
    </section>
  )
}

const lastSix = (rows: MonthRow[]) => rows.slice(-6).map((r) => r.closing_cash)
