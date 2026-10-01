import { TriangleAlertIcon } from 'lucide-react'
import type { IncomeStatement } from '@/features/reports/api'
import { formatMoney, isNegative, isZero, type Money } from '@/lib/money'
import type { MonthRow, QueryLike as Q } from './model'
import { Polyline } from './Sparkline'
import { Loaded, Sub, Tile, TileRow, TileSkeleton, Value } from './parts'

export function HeadlineTiles({
  currency,
  fyLabel,
  cash,
  monthly,
  fy,
  month,
  invested,
  overdue,
}: {
  currency: string
  fyLabel: string
  cash: Q<{ total: Money; count: number }>
  monthly: Q<MonthRow[]>
  fy: Q<IncomeStatement>
  month: Q<IncomeStatement>
  invested: Q<{ total: Money; count: number }>
  overdue: Q<{ total: Money; tenants: number; months: number }>
}) {
  const m = (x: Money) => formatMoney(x, currency)
  return (
    <TileRow title="Key figures">
      <Tile label="Cash & bank" to="/money">
        <Loaded query={cash} skeleton={<TileSkeleton />}>
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
        <Loaded query={fy} skeleton={<TileSkeleton />}>
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

      <Tile label="Total invested" to="/reports/balance-sheet">
        <Loaded query={invested} skeleton={<TileSkeleton />}>
          {(i) => (
            <>
              <Value testid="invested-total">{m(i.total)}</Value>
              <Sub>
                {i.count} {i.count === 1 ? 'asset' : 'assets'} at cost
              </Sub>
            </>
          )}
        </Loaded>
      </Tile>

      <Loaded query={overdue} skeleton={<Tile label="Rent overdue" to="/leases"><TileSkeleton /></Tile>}>
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
    </TileRow>
  )
}

const lastSix = (rows: MonthRow[]) => rows.slice(-6).map((r) => r.closing_cash)
