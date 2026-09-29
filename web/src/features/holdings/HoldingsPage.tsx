import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, CarIcon, CoinsIcon, PlusIcon, SearchIcon, TagIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { HoldingStatusBadge } from '@/components/StatusBadge'
import { useOrg } from '@/features/org/OrgProvider'
import { HOLDING_CLASSES, purityLabel, type HoldingClass } from '@/lib/labels'
import { formatMoney, isNegative, sub, toMoney, today } from '@/lib/money'
import { formatWeight, isWeightUnit, toGrams, WEIGHT_UNITS, type WeightUnit } from '@/lib/quantity'
import { cn } from '@/lib/utils'
import { createHolding, fetchHoldings, fetchValuation, holdingKeys, type HoldingRow, type Valuation } from './api'
import { HoldingFormDialog } from './HoldingFormDialog'
import { filterHoldings, isStaleRate, STATUS_FILTERS, statusCounts, vehicleTitle, type StatusFilter } from './model'
import { RateDialog } from './RateDialog'

/** The unit gold/silver weights are shown in, kept in the URL (?unit=g) so reloads and shared links keep it. */
export function useWeightUnit() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('unit')
  const unit: WeightUnit = isWeightUnit(raw) ? raw : 'tola'
  const setUnit = (u: WeightUnit) => {
    const next = new URLSearchParams(params)
    next.set('unit', u)
    setParams(next, { replace: true })
  }
  return { unit, setUnit }
}

export function UnitSwitch({ unit, setUnit }: ReturnType<typeof useWeightUnit>) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Weight unit">
      {WEIGHT_UNITS.map((u) => (
        <button
          key={u.value}
          type="button"
          aria-pressed={unit === u.value}
          onClick={() => setUnit(u.value)}
          className={cn('rounded px-2.5 py-1 text-sm', unit === u.value ? 'bg-foreground text-background' : 'hover:bg-accent')}
        >
          {u.label}
        </button>
      ))}
    </div>
  )
}

/** Vehicles, Gold and Silver registers (spec 003 §7.2, §7.3). */
export function HoldingsPage({ cls }: { cls: HoldingClass }) {
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [rating, setRating] = useState(false)
  const units = useWeightUnit()
  const metal = cls !== 'vehicle'
  const meta = HOLDING_CLASSES[cls]

  const list = useQuery({ queryKey: holdingKeys.all(current.id), queryFn: () => fetchHoldings(current.id) })
  const valuation = useQuery({ queryKey: holdingKeys.valuation(current.id), queryFn: () => fetchValuation(current.id) })
  const ofClass = useMemo(() => (list.data ?? []).filter((h) => h.class === cls), [list.data, cls])
  const rows = useMemo(() => filterHoldings(ofClass, { status, q }), [ofClass, status, q])
  const counts = useMemo(() => statusCounts(ofClass), [ofClass])
  const totals = valuation.data?.find((v) => v.class === cls)
  const m = (v: number | string | null) => formatMoney(toMoney(v), current.currency)
  const w = (g: number | string | null) => formatWeight(toGrams(g), units.unit)
  const Icon = metal ? CoinsIcon : CarIcon

  return (
    <>
      <PageHeader
        title={meta.label}
        description={
          metal
            ? `Every ${cls} item you hold or have sold, by weight, at cost and at today's rate`
            : 'Every vehicle you own or have sold, with what it cost to buy and run'
        }
        actions={
          canWrite && (
            <>
              {metal && (
                <Button variant="outline" onClick={() => setRating(true)}>
                  <TagIcon /> Set today&apos;s rate
                </Button>
              )}
              <Button onClick={() => setAdding(true)}>
                <PlusIcon /> Add {metal ? 'item' : 'vehicle'}
              </Button>
            </>
          )
        }
      />

      {valuation.isPending ? (
        <SectionLoading label="Working out totals…" />
      ) : valuation.isError ? (
        <SectionError error={valuation.error} onRetry={() => valuation.refetch()} />
      ) : (
        totals && <Totals cls={cls} v={totals} m={m} w={w} units={units} />
      )}

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={status === f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              status === f.value ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent',
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.value]}</span>
          </button>
        ))}
      </div>
      <div className="relative mb-4">
        <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          aria-label={`Search ${meta.label.toLowerCase()}`}
          placeholder={metal ? 'Search code or name' : 'Search code, name, make, model or registration'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8"
        />
      </div>

      {list.isPending ? (
        <SectionLoading label={`Loading ${meta.label.toLowerCase()}…`} />
      ) : list.isError ? (
        <SectionError error={list.error} onRetry={() => list.refetch()} />
      ) : ofClass.length === 0 ? (
        <EmptyState icon={Icon} title={metal ? `No ${cls} yet` : 'No vehicles yet'}>
          {canWrite ? `Add a ${meta.one}, then record its purchase (or enter it in opening balances).` : 'Nothing has been added yet.'}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={SearchIcon} title="Nothing matches these filters" />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 md:hidden" data-testid="holding-cards">
            {rows.map((h) => (
              <li key={h.id}>
                <Link to={`${meta.path}/${h.id}`} className="block rounded-lg border p-3 hover:bg-accent">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{h.code}</div>
                      <div className="truncate text-sm text-muted-foreground">{subtitle(h)}</div>
                    </div>
                    <HoldingStatusBadge status={h.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-sm tabular-nums">
                    {metal ? (
                      <>
                        <span>{w(h.weight_g)}</span>
                        <span className="text-muted-foreground">Cost {m(h.cost)}</span>
                        {h.market_value != null && <span>Worth {m(h.market_value)}</span>}
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground">Cost {m(h.total_cost)}</span>
                        <span>Running {m(h.running_expenses)}</span>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm" data-testid="holding-table">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">{metal ? 'Name' : 'Vehicle'}</th>
                  {metal ? (
                    <>
                      <th className="px-4 py-2 font-medium">Purity</th>
                      <th className="px-4 py-2 text-right font-medium">Weight held</th>
                      <th className="px-4 py-2 text-right font-medium">Cost</th>
                      <th className="px-4 py-2 text-right font-medium">Market value</th>
                      <th className="px-4 py-2 text-right font-medium">Unrealized gain</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2 font-medium">Registration</th>
                      <th className="px-4 py-2 text-right font-medium">Cost</th>
                      <th className="px-4 py-2 text-right font-medium">Running expenses</th>
                      <th className="px-4 py-2 text-right font-medium">Gain on sale</th>
                    </>
                  )}
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((h) => (
                  <tr key={h.id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`${meta.path}/${h.id}`)}>
                    <td className="px-4 py-2 font-semibold">
                      <Link to={`${meta.path}/${h.id}`} onClick={(e) => e.stopPropagation()}>
                        {h.code}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{(metal ? h.name : subtitle(h)) || <span className="text-muted-foreground">—</span>}</td>
                    {metal ? (
                      <>
                        <td className="px-4 py-2">{purityLabel(cls, h.purity)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{w(h.weight_g)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{m(h.cost)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{h.market_value == null ? '—' : m(h.market_value)}</td>
                        <td className={cn('px-4 py-2 text-right whitespace-nowrap tabular-nums', isNegative(toMoney(h.unrealized_gain)) && 'text-red-700 dark:text-red-400')}>
                          {h.unrealized_gain == null ? '—' : m(h.unrealized_gain)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2">{h.registration_no ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{m(h.total_cost)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{m(h.running_expenses)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">{h.status === 'sold' ? m(h.realized_gain) : '—'}</td>
                      </>
                    )}
                    <td className="px-4 py-2">
                      <HoldingStatusBadge status={h.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HoldingFormDialog
        open={adding}
        onOpenChange={setAdding}
        classes={[cls]}
        onSave={async (c, input) => {
          const created = await createHolding(current.id, c, input)
          await qc.invalidateQueries({ queryKey: holdingKeys.all(current.id) })
          toast.success(`${created.code} added`)
          navigate(`${meta.path}/${created.id}`)
        }}
      />
      {metal && (
        <RateDialog
          open={rating}
          onOpenChange={setRating}
          metal={cls}
          current={totals?.rate_per_tola != null ? { rate_per_tola: toMoney(totals.rate_per_tola), rate_date: totals.rate_date } : null}
        />
      )}
    </>
  )
}

function subtitle(h: HoldingRow) {
  if (h.class === 'vehicle') return [vehicleTitle(h), h.name].filter(Boolean).join(' · ')
  return [h.name, purityLabel(h.class, h.purity)].filter(Boolean).join(' · ')
}

/** Header figures: for metals weight, cost, value at the latest rate and the rate itself; for vehicles count and cost. */
function Totals({
  cls,
  v,
  m,
  w,
  units,
}: {
  cls: HoldingClass
  v: Valuation
  m: (x: number | string | null) => string
  w: (g: number | string | null) => string
  units: ReturnType<typeof useWeightUnit>
}) {
  const noRate = v.rate_per_tola == null
  const stale = isStaleRate(v.rate_date, today())
  const tiles =
    cls === 'vehicle'
      ? [
          { label: 'Vehicles held', value: String(v.items), testid: 'holdings-items' },
          { label: 'Cost of vehicles held', value: m(v.cost), testid: 'holdings-cost' },
        ]
      : [
          { label: 'Weight held', value: w(v.weight_g), testid: 'holdings-weight' },
          { label: 'Cost', value: m(v.cost), testid: 'holdings-cost' },
          { label: "Worth at today's rate", value: v.market_value == null ? 'No rate yet' : m(v.market_value), testid: 'holdings-market' },
          {
            label: 'Unrealized gain',
            value: v.market_value == null ? '—' : m(sub(toMoney(v.market_value), toMoney(v.cost))),
            testid: 'holdings-gain',
          },
        ]
  return (
    <div className="mb-4 grid grid-cols-1 gap-3">
      <div className={cn('grid grid-cols-2 gap-3', cls !== 'vehicle' && 'lg:grid-cols-4')}>
        {tiles.map((t) => (
          <Card key={t.label} size="sm">
            <CardHeader>
              <CardDescription>{t.label}</CardDescription>
              <CardTitle className="text-lg tabular-nums" data-testid={t.testid}>
                {t.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {cls !== 'vehicle' && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p
            data-testid="holdings-rate"
            className={cn('flex items-center gap-1.5', (noRate || stale) && 'text-amber-800 dark:text-amber-300')}
          >
            {(noRate || stale) && <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />}
            {noRate
              ? `No ${cls} rate entered yet, so market value is unknown.`
              : `Rate ${m(v.rate_per_tola)} per tola of pure ${cls}${stale ? `, from ${v.rate_date}: enter today's rate` : ` · ${v.rate_date}`}`}
          </p>
          <UnitSwitch {...units} />
        </div>
      )}
    </div>
  )
}
