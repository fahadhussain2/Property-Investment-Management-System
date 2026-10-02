import type { IncomeStatement } from '@/features/reports/api'
import { formatMoney, isNegative, isZero, type Money } from '@/lib/money'
import { CASH_LOOK, INVESTED_LOOK, overdueLook, profitLook, type MonthRow, type QueryLike as Q } from './model'
import { Polyline } from './Sparkline'
import { Loaded, Sub, Tile, TILE_BODY, TileGrid, TileRow, TileSkeleton, Value } from './parts'

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
  const due = overdue.data !== undefined && !isZero(overdue.data.total)
  return (
    <TileRow title="Key figures">
      <TileGrid>
        <Tile label="Cash & bank" to="/money" look={CASH_LOOK} index={0}>
          <Loaded query={cash} skeleton={<TileSkeleton />} className={TILE_BODY}>
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

        <Tile label={`Net profit · ${fyLabel}`} to="/reports/income-statement" look={profitLook(fy.data?.net_profit)} index={1}>
          <Loaded query={fy} skeleton={<TileSkeleton />} className={TILE_BODY}>
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

        <Tile label="Total invested" to="/reports/balance-sheet" look={INVESTED_LOOK} index={2}>
          <Loaded query={invested} skeleton={<TileSkeleton />} className={TILE_BODY}>
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

        {/* Critical style only when rent is overdue (spec 002 §3.1): red ring, red label, warning icon. */}
        <Tile label="Rent overdue" to="/leases" look={overdueLook(overdue.data?.total)} alert={due} index={3}>
          <Loaded query={overdue} skeleton={<TileSkeleton />} className={TILE_BODY}>
            {(o) => (
              <>
                <Value testid="rent-overdue">{m(o.total)}</Value>
                <Sub>
                  {isZero(o.total)
                    ? 'No rent overdue'
                    : `${o.tenants} ${o.tenants === 1 ? 'tenant' : 'tenants'} · ${o.months} ${o.months === 1 ? 'month' : 'months'} unpaid`}
                </Sub>
              </>
            )}
          </Loaded>
        </Tile>
      </TileGrid>
    </TileRow>
  )
}

const lastSix = (rows: MonthRow[]) => rows.slice(-6).map((r) => r.closing_cash)
