import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, BadgeDollarSignIcon, PencilIcon, PlusIcon, ShoppingCartIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MoneyTable, Row } from '@/components/MoneyTable'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { HoldingStatusBadge } from '@/components/StatusBadge'
import { VoucherList } from '@/components/VoucherList'
import { DocumentsSection } from '@/features/documents/DocumentsSection'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchVouchersFor } from '@/features/properties/api'
import { friendlyError } from '@/lib/forms'
import { HOLDING_CLASSES, purityLabel, type HoldingClass } from '@/lib/labels'
import { formatMoney, isZero, sum, toMoney } from '@/lib/money'
import { formatWeight, toGrams } from '@/lib/quantity'
import { deleteHolding, fetchHolding, fetchHoldingBreakdown, holdingKeys, updateHolding, type Holding, type HoldingRow } from './api'
import { HoldingFormDialog } from './HoldingFormDialog'
import { UnitSwitch, useWeightUnit } from './HoldingsPage'
import { formatCc, vehicleTitle } from './model'

/** One vehicle or gold/silver item: figures, how its cost and gain are made up, and every entry (spec 003 §7.4). */
export function HoldingPage({ cls }: { cls: HoldingClass }) {
  const { id = '' } = useParams()
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const units = useWeightUnit()
  const meta = HOLDING_CLASSES[cls]

  const detail = useQuery({ queryKey: holdingKeys.detail(current.id, id), queryFn: () => fetchHolding(current.id, id) })
  const vouchers = useQuery({
    queryKey: ['vouchers', current.id, 'holding', id],
    queryFn: () => fetchVouchersFor(current.id, { holding_id: id }),
  })
  const m = (v: number | string | null) => formatMoney(toMoney(v), current.currency)

  if (detail.isPending) return <SectionLoading label="Loading…" />
  if (detail.isError) return <SectionError error={detail.error} onRetry={() => detail.refetch()} />
  const h = detail.data
  if (!h) {
    return (
      <>
        <PageHeader title="Not found" />
        <Link to={meta.path} className="text-sm underline">
          Back to {meta.label.toLowerCase()}
        </Link>
      </>
    )
  }
  // An item opened under the wrong register (e.g. an old link) goes to its own.
  if (h.class !== cls) return <Navigate to={`${HOLDING_CLASSES[h.class].path}/${h.id}`} replace />

  const metal = cls !== 'vehicle'
  const sold = h.status === 'sold'
  const hasSale = !isZero(toMoney(h.sale_price))
  const title = [h.code, h.name ?? (metal ? null : vehicleTitle(h) || null)].filter(Boolean).join(' · ')

  async function onDelete() {
    if (!confirm(`Delete ${h!.code}? This cannot be undone.`)) return
    try {
      await deleteHolding(current.id, h!.id)
      await qc.invalidateQueries({ queryKey: holdingKeys.all(current.id) })
      toast.success(`${h!.code} deleted`)
      navigate(meta.path, { replace: true })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const kpis = [
    ...(metal
      ? [
          { label: 'Weight held', value: formatWeight(toGrams(h.weight_g), units.unit), testid: 'kpi-weight' },
          { label: 'Cost of what is held', value: m(h.cost), testid: 'kpi-cost' },
          { label: "Worth at today's rate", value: h.market_value == null ? 'No rate yet' : m(h.market_value), testid: 'kpi-market' },
          { label: 'Unrealized gain', value: h.unrealized_gain == null ? '—' : m(h.unrealized_gain), testid: 'kpi-unrealized' },
        ]
      : [
          { label: 'Total cost', value: m(h.total_cost), testid: 'kpi-cost' },
          { label: 'Running expenses', value: m(h.running_expenses), testid: 'kpi-running' },
        ]),
    ...(hasSale
      ? [
          { label: 'Sold for', value: m(h.sale_price), testid: 'kpi-sale' },
          { label: 'Gain on sale', value: m(h.realized_gain), testid: 'kpi-gain' },
        ]
      : []),
  ]
  const details = (
    metal
      ? [
          ['Purity', purityLabel(cls, h.purity)],
          ['Notes', h.notes],
        ]
      : [
          ['Vehicle', vehicleTitle(h)],
          ['Engine capacity', h.engine_cc ? formatCc(h.engine_cc) : null],
          ['Registration', h.registration_no],
          ['Colour', h.colour],
          ['Chassis no.', h.chassis_no],
          ['Engine no.', h.engine_no],
          ['Notes', h.notes],
        ]
  ).filter(([, v]) => v) as [string, string][]
  const sellClass = metal ? 'metal' : 'vehicle'

  return (
    <>
      <Link to={meta.path} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> {meta.label}
      </Link>
      <PageHeader
        title={title}
        description={
          <span className="mt-1 inline-flex flex-wrap items-center gap-2">
            <HoldingStatusBadge status={h.status} />
            {metal && h.rate_date && <span>Rate from {h.rate_date}</span>}
          </span>
        }
        actions={
          canWrite && (
            <>
              {!sold && metal && (
                <Link to={`/new/holding_purchase?class=metal&holding_id=${h.id}`} className={buttonVariants({ variant: 'outline' })}>
                  <ShoppingCartIcon /> Buy more
                </Link>
              )}
              {!sold && (
                <Link to={`/new/holding_cost?holding_id=${h.id}`} className={buttonVariants({ variant: 'outline' })}>
                  <PlusIcon /> Add a cost
                </Link>
              )}
              {!sold && (
                <Link to={`/new/holding_sale?class=${sellClass}&holding_id=${h.id}`} className={buttonVariants({ variant: 'outline' })}>
                  <BadgeDollarSignIcon /> Sell
                </Link>
              )}
              <Button variant="outline" size="icon" aria-label={`Edit ${meta.one}`} onClick={() => setEditing(true)}>
                <PencilIcon />
              </Button>
              <Button variant="outline" size="icon" aria-label={`Delete ${meta.one}`} onClick={onDelete}>
                <Trash2Icon />
              </Button>
            </>
          )
        }
      />

      {metal && (
        <div className="mb-3 flex justify-end">
          <UnitSwitch {...units} />
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} size="sm">
            <CardHeader>
              <CardDescription>{k.label}</CardDescription>
              <CardTitle className="text-lg tabular-nums" data-testid={k.testid}>
                {k.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mb-6">
        <HoldingBreakdown holding={h} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Details</h2>
          {details.length === 0 ? (
            <p className="text-sm text-muted-foreground">No details recorded.</p>
          ) : (
            <dl className="divide-y rounded-lg border text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="flex gap-3 px-4 py-2">
                  <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words whitespace-pre-line">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-6">
            <DocumentsSection link={{ holding_id: h.id }} recordLabel={h.code} />
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Entries</h2>
          {vouchers.isPending ? (
            <SectionLoading label="Loading entries…" />
          ) : vouchers.isError ? (
            <SectionError error={vouchers.error} onRetry={() => vouchers.refetch()} />
          ) : (
            <VoucherList rows={vouchers.data} currency={current.currency} />
          )}
        </section>
      </div>

      <HoldingFormDialog
        open={editing}
        onOpenChange={setEditing}
        classes={[cls]}
        holding={h as unknown as Holding}
        onSave={async (_c, input) => {
          await updateHolding(current.id, h.id, input)
          await qc.invalidateQueries({ queryKey: holdingKeys.all(current.id) })
          toast.success('Details updated')
        }}
      />
    </>
  )
}

/** How the item's cost and gain on sale are made up; rows add up to the figures above (proven in pgTAP). */
function HoldingBreakdown({ holding: h }: { holding: HoldingRow }) {
  const { current } = useOrg()
  const q = useQuery({
    queryKey: [...holdingKeys.detail(current.id, h.id), 'breakdown'],
    queryFn: () => fetchHoldingBreakdown(current.id, h.id),
  })
  const m = (x: string) => formatMoney(x, current.currency)
  if (q.isPending) return <SectionLoading />
  if (q.isError) return <SectionError error={q.error} onRetry={() => q.refetch()} />
  const rows = q.data.map((r) => ({ ...r, amount: toMoney(r.amount) }))
  const of = (s: string) => rows.filter((r) => r.section === s)
  const cost = of('cost')
  const expenses = of('expense')
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="holding-breakdown">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">How the cost is made up</h2>
        <MoneyTable minWidth="16rem">
          <tbody>
            {cost.map((r) => (
              <Row key={r.label} label={r.label} amount={m(r.amount)} />
            ))}
            {cost.length === 0 && <Row label={<span className="text-muted-foreground">No cost recorded yet</span>} amount="" />}
            <Row strong label="Total cost" amount={m(sum(cost.map((r) => r.amount)))} testid="breakdown-cost-total" />
          </tbody>
        </MoneyTable>
      </section>
      <section className="grid grid-cols-1 gap-4">
        {of('sale').length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Sales</h2>
            <MoneyTable minWidth="16rem">
              <tbody>
                {of('sale').map((r) => <Row key={r.label} label={r.label} amount={m(r.amount)} />)}
                {of('cost_of_sale').map((r) => <Row key={r.label} label={`Less: ${r.label.toLowerCase()}`} amount={`(${m(r.amount)})`} />)}
                <Row strong label="Gain on sale" amount={m(toMoney(h.realized_gain))} testid="breakdown-gain" />
              </tbody>
            </MoneyTable>
          </div>
        )}
        {h.class === 'vehicle' && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Running expenses</h2>
            <MoneyTable minWidth="16rem">
              <tbody>
                {expenses.map((r) => <Row key={r.label} label={r.label} amount={m(r.amount)} />)}
                {expenses.length === 0 && (
                  <Row label={<span className="text-muted-foreground">None yet. Tag fuel, repairs and taxes to this vehicle when you record them.</span>} amount="" />
                )}
                <Row strong label="Total running expenses" amount={m(sum(expenses.map((r) => r.amount)))} testid="breakdown-running" />
              </tbody>
            </MoneyTable>
          </div>
        )}
      </section>
    </div>
  )
}
