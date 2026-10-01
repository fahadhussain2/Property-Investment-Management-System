import { HOLDING_CLASSES } from '@/lib/labels'
import { formatMoney, type Money } from '@/lib/money'
import { formatWeight } from '@/lib/quantity'
import { ASSET_CLASSES, type AssetTotals, type Portfolio, type QueryLike as Q } from './model'
import { Loaded, Sub, Tile, TileRow, TileSkeleton, Value } from './parts'

/**
 * What we own: properties, vehicles, gold and silver, each at cost (they add up to Total invested).
 * Gold and silver also show the weight held and its worth at the latest rate, which is display only.
 * A class with nothing held keeps its tile ("None held") so the grid never changes shape.
 */
export function AssetTiles({ currency, portfolio, assets }: { currency: string; portfolio: Q<Portfolio>; assets: Q<AssetTotals[]> }) {
  const m = (x: Money) => formatMoney(x, currency)
  return (
    <TileRow title="What we own">
      <Tile label="Properties" to="/properties" testid="asset-property">
        <Loaded query={portfolio} skeleton={<TileSkeleton />}>
          {(p) =>
            p.held === 0 ? (
              <Value muted testid="held-cost">
                None held
              </Value>
            ) : (
              <>
                <Value testid="held-cost">{m(p.heldCost)}</Value>
                <Sub>
                  {p.held} {p.held === 1 ? 'property' : 'properties'} at cost
                </Sub>
              </>
            )
          }
        </Loaded>
      </Tile>

      {ASSET_CLASSES.map((c) => {
        const meta = HOLDING_CLASSES[c]
        return (
          <Tile key={c} label={meta.label} to={meta.path} testid={`asset-${c}`}>
            <Loaded query={assets} skeleton={<TileSkeleton />}>
              {(rows) => {
                const a = rows.find((r) => r.class === c)
                if (!a || a.items === 0) return <Value muted>None held</Value>
                return (
                  <>
                    <Value>{m(a.cost)}</Value>
                    <Sub>
                      {c === 'vehicle' ? (
                        `${a.items} ${a.items === 1 ? 'vehicle' : 'vehicles'} at cost`
                      ) : (
                        <>
                          {formatWeight(a.weight_g, 'tola')}
                          {' · '}
                          {a.market_value == null ? 'no rate yet' : <>worth <span className="whitespace-nowrap tabular-nums">{m(a.market_value)}</span></>}
                        </>
                      )}
                    </Sub>
                  </>
                )
              }}
            </Loaded>
          </Tile>
        )
      })}
    </TileRow>
  )
}
