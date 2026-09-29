import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MoneyTable, td, tdNum, th, thNum } from '@/components/MoneyTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { ReportShell } from '@/components/ReportShell'
import { fetchHoldings, fetchValuation, holdingKeys, type HoldingRow } from '@/features/holdings/api'
import { UnitSwitch, useWeightUnit } from '@/features/holdings/HoldingsPage'
import { vehicleTitle } from '@/features/holdings/model'
import { useOrg } from '@/features/org/OrgProvider'
import { HOLDING_CLASSES, purityLabel, type HoldingClass } from '@/lib/labels'
import { formatMoney, sub, sum, toMoney, today } from '@/lib/money'
import { formatWeight, fromGrams, toGrams } from '@/lib/quantity'
import { cn } from '@/lib/utils'

const CLASSES: HoldingClass[] = ['vehicle', 'gold', 'silver']

/**
 * Everything held that is not property or money: each vehicle and gold/silver item at cost and, for metals,
 * at the latest rate (spec 003 §7.7). As of today: market value uses the latest rate entered.
 */
export function HoldingsReportPage() {
  const { current } = useOrg()
  const units = useWeightUnit()
  const items = useQuery({ queryKey: holdingKeys.all(current.id), queryFn: () => fetchHoldings(current.id) })
  const valuation = useQuery({ queryKey: holdingKeys.valuation(current.id), queryFn: () => fetchValuation(current.id) })
  const m = (x: string) => formatMoney(x, current.currency)
  const w = (g: number | string | null) => formatWeight(toGrams(g), units.unit)

  const held = (items.data ?? []).filter((h) => h.status !== 'sold')
  const totals = valuation.data ?? []
  const byClass = (c: HoldingClass) => totals.find((t) => t.class === c)
  const totalCost = sum(totals.map((t) => toMoney(t.cost)))
  // Vehicles count at cost; a metal without a rate makes the market total unknown (never a made-up 0).
  const unknownMarket = totals.some((t) => t.class !== 'vehicle' && t.market_value == null)
  const totalMarket = unknownMarket
    ? null
    : sum(totals.map((t) => (t.class === 'vehicle' ? toMoney(t.cost) : toMoney(t.market_value))))

  const csv = items.data &&
    valuation.data && {
      name: `vehicles-gold-silver-${today()}`,
      headers: ['Class', 'Code', 'Name', 'Purity', `Weight held (${units.unit})`, 'Cost', 'Market value', 'Unrealized gain'],
      rows: held.map((h) => [
        HOLDING_CLASSES[h.class].label,
        h.code,
        h.class === 'vehicle' ? [vehicleTitle(h), h.name].filter(Boolean).join(' · ') : h.name,
        purityLabel(h.class, h.purity),
        h.class === 'vehicle' ? null : fromGrams(toGrams(h.weight_g), units.unit),
        toMoney(h.cost),
        h.market_value == null ? null : toMoney(h.market_value),
        h.unrealized_gain == null ? null : toMoney(h.unrealized_gain),
      ]),
    }

  return (
    <ReportShell
      title="Vehicles, gold & silver"
      subtitle={`As of ${today()}`}
      description="What you hold besides property and money: at cost, and gold and silver at your latest rate. The books stay at cost."
      controls={
        <div className="print:hidden">
          <UnitSwitch {...units} />
        </div>
      }
      csv={csv || undefined}
    >
      {items.isPending || valuation.isPending ? (
        <SectionLoading />
      ) : items.isError || valuation.isError ? (
        <SectionError error={items.error ?? valuation.error} onRetry={() => Promise.all([items.refetch(), valuation.refetch()])} />
      ) : (
        <MoneyTable testid="holdings-report" minWidth="44rem">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Item</th>
              <th className={thNum}>Weight held</th>
              <th className={thNum}>Cost</th>
              <th className={thNum}>Market value</th>
              <th className={thNum}>Unrealized gain</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {CLASSES.map((c) => {
              const rows = held.filter((h) => h.class === c)
              const t = byClass(c)
              const metal = c !== 'vehicle'
              return (
                <ClassRows
                  key={c}
                  cls={c}
                  rows={rows}
                  m={m}
                  w={w}
                  total={
                    t && {
                      weight: metal ? w(t.weight_g) : '',
                      cost: toMoney(t.cost),
                      market: metal ? (t.market_value == null ? null : toMoney(t.market_value)) : undefined,
                      rate: metal && t.rate_per_tola != null ? `${m(toMoney(t.rate_per_tola))} per tola · ${t.rate_date}` : metal ? 'no rate yet' : null,
                    }
                  }
                />
              )
            })}
            <tr className="border-t-2 font-semibold" data-testid="holdings-report-total">
              <td className={td}>Total</td>
              <td className={tdNum} />
              <td className={tdNum}>{m(totalCost)}</td>
              <td className={tdNum}>{totalMarket == null ? '—' : m(totalMarket)}</td>
              <td className={tdNum}>{totalMarket == null ? '—' : m(sub(totalMarket, totalCost))}</td>
            </tr>
          </tbody>
        </MoneyTable>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        Vehicles are counted at cost in the totals. Market value = weight ÷ 11.6638038 g per tola × rate × purity.
      </p>
    </ReportShell>
  )
}

function ClassRows({
  cls,
  rows,
  m,
  w,
  total,
}: {
  cls: HoldingClass
  rows: HoldingRow[]
  m: (x: string) => string
  w: (g: number | string | null) => string
  total?: { weight: string; cost: string; market: string | null | undefined; rate: string | null }
}) {
  const meta = HOLDING_CLASSES[cls]
  const metal = cls !== 'vehicle'
  return (
    <>
      <tr>
        <td colSpan={5} className={cn(td, 'pt-3 font-semibold')}>
          <Link to={meta.path} className="hover:underline">
            {meta.label}
          </Link>
          {total?.rate && <span className="ml-2 text-xs font-normal text-muted-foreground">Rate {total.rate}</span>}
        </td>
      </tr>
      {rows.map((h) => (
        <tr key={h.id}>
          <td className={cn(td, 'pl-6')}>
            <Link to={`${meta.path}/${h.id}`} className="font-medium hover:underline">
              {h.code}
            </Link>{' '}
            <span className="text-muted-foreground">
              {metal ? [h.name, purityLabel(cls, h.purity)].filter(Boolean).join(' · ') : [vehicleTitle(h), h.name].filter(Boolean).join(' · ')}
            </span>
          </td>
          <td className={tdNum}>{metal ? w(h.weight_g) : ''}</td>
          <td className={tdNum}>{m(toMoney(h.cost))}</td>
          <td className={tdNum}>{metal ? (h.market_value == null ? '—' : m(toMoney(h.market_value))) : ''}</td>
          <td className={tdNum}>{metal ? (h.unrealized_gain == null ? '—' : m(toMoney(h.unrealized_gain))) : ''}</td>
        </tr>
      ))}
      {rows.length === 0 && (
        <tr>
          <td colSpan={5} className={cn(td, 'pl-6 text-muted-foreground')}>
            Nothing held
          </td>
        </tr>
      )}
      {total && rows.length > 0 && (
        <tr className="font-medium" data-testid={`holdings-report-${cls}`}>
          <td className={cn(td, 'pl-6')}>Total {meta.label.toLowerCase()}</td>
          <td className={tdNum}>{total.weight}</td>
          <td className={tdNum}>{m(total.cost)}</td>
          <td className={tdNum}>{total.market === undefined ? '' : total.market == null ? '—' : m(total.market)}</td>
          <td className={tdNum}>
            {total.market === undefined ? '' : total.market == null ? '—' : m(sub(total.market, total.cost))}
          </td>
        </tr>
      )}
    </>
  )
}
