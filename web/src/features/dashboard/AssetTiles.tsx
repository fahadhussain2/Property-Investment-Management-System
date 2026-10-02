import { HOLDING_CLASSES } from '@/lib/labels'
import { formatMoney, type Money } from '@/lib/money'
import { formatWeight } from '@/lib/quantity'
import { ASSET_CLASSES, ASSET_LOOK, type AssetTotals, type Portfolio, type QueryLike as Q } from './model'
import { AssetCard, AssetSection, Loaded, Sub, TILE_BODY, TileRow, TileSkeleton, Value } from './parts'

/**
 * What we own: properties, vehicles, gold and silver, each at cost (they add up to Total invested).
 * Gold and silver also show the weight held and its worth at the latest rate, which is display only.
 * One compact card in four sections (spec 005 §4), since together they break down Total invested.
 * A class with nothing held keeps its section ("None held") so the card never changes shape.
 */
export function AssetTiles({ currency, portfolio, assets }: { currency: string; portfolio: Q<Portfolio>; assets: Q<AssetTotals[]> }) {
  const m = (x: Money) => formatMoney(x, currency)
  return (
    <TileRow title="What we own">
      <AssetCard>
        <AssetSection label="Properties" to="/properties" look={ASSET_LOOK.property} index={0} testid="asset-property">
          <Loaded query={portfolio} skeleton={<TileSkeleton compact />} className={TILE_BODY}>
            {(p) =>
              p.held === 0 ? (
                <Value compact muted testid="held-cost">
                  None held
                </Value>
              ) : (
                <>
                  <Value compact testid="held-cost">
                    {m(p.heldCost)}
                  </Value>
                  <Sub compact>
                    {p.held} {p.held === 1 ? 'property' : 'properties'} at cost
                  </Sub>
                </>
              )
            }
          </Loaded>
        </AssetSection>

        {ASSET_CLASSES.map((c, i) => {
          const meta = HOLDING_CLASSES[c]
          return (
            <AssetSection key={c} label={meta.label} to={meta.path} look={ASSET_LOOK[c]} index={i + 1} testid={`asset-${c}`}>
              <Loaded query={assets} skeleton={<TileSkeleton compact />} className={TILE_BODY}>
                {(rows) => {
                  const a = rows.find((r) => r.class === c)
                  if (!a || a.items === 0)
                    return (
                      <Value compact muted>
                        None held
                      </Value>
                    )
                  return (
                    <>
                      <Value compact>{m(a.cost)}</Value>
                      <Sub compact>
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
            </AssetSection>
          )
        })}
      </AssetCard>
    </TileRow>
  )
}
