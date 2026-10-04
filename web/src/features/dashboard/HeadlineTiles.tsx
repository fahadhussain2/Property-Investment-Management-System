import type { IncomeStatement } from '@/features/reports/api'
import { formatMoney, isNegative, isZero, type Money } from '@/lib/money'
import {
  BANK_LOOK,
  CASH_LOOK,
  cashTrend,
  INVESTED_LOOK,
  overdueLook,
  profitLook,
  type cashByKind,
  type CashMonth,
  type QueryLike as Q,
} from './model'
import { Polyline } from './Sparkline'
import { Loaded, Sub, Tile, TILE_BODY, TILE_SPAN, TileGrid, TileRow, TileSkeleton, Value } from './parts'

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
  cash: Q<ReturnType<typeof cashByKind>>
  monthly: Q<CashMonth[]>
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
        {/* Cash and Bank, each with its 6-month trend line (005 amendment 4). The trend line sits beside the
            account count from sm up; on phones the tiles are too narrow for both. */}
        {(['Cash', 'Bank'] as const).map((kind, i) => (
          <Tile key={kind} label={kind} to="/money" look={kind === 'Cash' ? CASH_LOOK : BANK_LOOK} index={i} className={TILE_SPAN.third}>
            <Loaded query={cash} skeleton={<TileSkeleton />} className={TILE_BODY}>
              {(c) => (
                <>
                  <Value testid={`${kind.toLowerCase()}-total`} negative={isNegative(c[kind].total)}>
                    {m(c[kind].total)}
                  </Value>
                  <span className="flex items-center justify-between gap-2 sm:min-h-6">
                    <Sub>{c[kind].count ? `${c[kind].count} ${c[kind].count === 1 ? 'account' : 'accounts'}` : 'No accounts yet'}</Sub>
                    {monthly.data && (
                      <span className="hidden sm:block" data-testid={`${kind.toLowerCase()}-trend`}>
                        <Polyline values={cashTrend(monthly.data, kind)} />
                      </span>
                    )}
                  </span>
                </>
              )}
            </Loaded>
          </Tile>
        ))}

        <Tile label={`Net profit · ${fyLabel}`} to="/reports/income-statement" look={profitLook(fy.data?.net_profit)} index={2} className={TILE_SPAN.third}>
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

        <Tile label="Total invested" to="/reports/balance-sheet" look={INVESTED_LOOK} index={3} className={TILE_SPAN.half}>
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
        <Tile label="Rent overdue" to="/leases" look={overdueLook(overdue.data?.total)} alert={due} index={4} className={TILE_SPAN.last}>
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
