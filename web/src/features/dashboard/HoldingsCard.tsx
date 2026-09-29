import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchValuation, holdingKeys } from '@/features/holdings/api'
import { HOLDING_CLASSES, type HoldingClass } from '@/lib/labels'
import { formatMoney, toMoney } from '@/lib/money'
import { formatWeight, toGrams } from '@/lib/quantity'
import { Block, Loaded, Skeleton } from './parts'

const CLASSES: HoldingClass[] = ['vehicle', 'gold', 'silver']

/**
 * Vehicles, gold & silver (spec 003 §7.8): what is held, at cost and (metals) at the latest rate.
 * Hidden for a business that holds none, and while that is not yet known, so it never flashes up empty.
 * It sits last on the page, so appearing never pushes the blocks above it.
 */
export function HoldingsCard({ orgId, currency }: { orgId: string; currency: string }) {
  const q = useQuery({ queryKey: holdingKeys.valuation(orgId), queryFn: () => fetchValuation(orgId) })
  if (q.isPending) return null
  if (q.data && !q.data.some((v) => v.items > 0)) return null
  const m = (x: number | string | null) => formatMoney(toMoney(x), currency)
  return (
    <Block title="Vehicles, gold & silver" link={{ to: '/reports/holdings', label: 'Details' }} testid="holdings-card">
      <Loaded query={q} skeleton={<Skeleton className="h-24" />}>
        {(rows) => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CLASSES.map((c) => {
              const v = rows.find((r) => r.class === c)
              const meta = HOLDING_CLASSES[c]
              if (!v || v.items === 0)
                return (
                  <Link key={c} to={meta.path} className="rounded-lg border p-3 text-sm text-muted-foreground hover:bg-accent/50">
                    <span className="block font-medium text-foreground">{meta.label}</span>
                    None held
                  </Link>
                )
              return (
                <Link key={c} to={meta.path} className="rounded-lg border p-3 text-sm hover:bg-accent/50" data-testid={`holdings-card-${c}`}>
                  <span className="block font-medium">{meta.label}</span>
                  {c === 'vehicle' ? (
                    <span className="block text-muted-foreground">
                      {v.items} held · cost <span className="whitespace-nowrap text-foreground tabular-nums">{m(v.cost)}</span>
                    </span>
                  ) : (
                    <>
                      <span className="block text-lg font-semibold tabular-nums">{formatWeight(toGrams(v.weight_g), 'tola')}</span>
                      <span className="block text-muted-foreground">
                        Cost <span className="whitespace-nowrap text-foreground tabular-nums">{m(v.cost)}</span>
                        {' · '}
                        {v.market_value == null ? 'no rate yet' : <>worth <span className="whitespace-nowrap text-foreground tabular-nums">{m(v.market_value)}</span></>}
                      </span>
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </Loaded>
    </Block>
  )
}
