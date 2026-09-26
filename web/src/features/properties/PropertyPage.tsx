import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, PencilIcon, TagIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { PropertyStatusBadge } from '@/components/StatusBadge'
import { VoucherList } from '@/components/VoucherList'
import { useOrg } from '@/features/org/OrgProvider'
import { friendlyError } from '@/lib/forms'
import { kindLabel } from '@/lib/labels'
import { formatMoney, toMoney } from '@/lib/money'
import { deleteProperty, fetchProperty, fetchVouchersFor, propertyKeys, updateProperty } from './api'
import { PropertyBreakdown } from './PropertyBreakdown'
import { PropertyFormDialog } from './PropertyFormDialog'
import { forSaleSchema } from './schema'

export function PropertyPage() {
  const { id = '' } = useParams()
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [listing, setListing] = useState(false)

  const detail = useQuery({
    queryKey: propertyKeys.detail(current.id, id),
    queryFn: () => fetchProperty(current.id, id),
  })
  const vouchers = useQuery({
    queryKey: ['vouchers', current.id, 'property', id],
    queryFn: () => fetchVouchersFor(current.id, { property_id: id }),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: propertyKeys.all(current.id) })
  const money = (v: number | string) => formatMoney(toMoney(v), current.currency)

  if (detail.isPending) return <SectionLoading label="Loading property…" />
  if (detail.isError) return <SectionError error={detail.error} onRetry={() => detail.refetch()} />
  const { property, summary } = detail.data
  if (!property || !summary) {
    return (
      <>
        <PageHeader title="Property not found" />
        <Link to="/properties" className="text-sm underline">
          Back to properties
        </Link>
      </>
    )
  }

  async function onDelete() {
    if (!confirm(`Delete ${property!.code}? This cannot be undone.`)) return
    try {
      await deleteProperty(current.id, property!.id)
      await refresh()
      toast.success(`${property!.code} deleted`)
      navigate('/properties', { replace: true })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function removeFromSale() {
    try {
      await updateProperty(current.id, property!.id, { for_sale: false })
      await refresh()
      toast.success('Removed from sale')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const sold = summary.status === 'sold'
  const kpis = [
    { label: 'Total cost', value: money(summary.cost), testid: 'kpi-cost' },
    { label: 'Rent earned', value: money(summary.rent_income), testid: 'kpi-rent' },
    { label: 'Expenses', value: money(summary.expenses), testid: 'kpi-expenses' },
    ...(sold ? [{ label: 'Sold for', value: money(summary.sale_price), testid: 'kpi-sale' }] : []),
    { label: 'Net profit', value: money(summary.net_profit), testid: 'kpi-profit' },
    { label: 'Return on cost', value: summary.roi_pct == null ? '—' : `${summary.roi_pct}%`, testid: 'kpi-roi' },
  ]
  const details = [
    ['Type', kindLabel(property.kind)],
    ['Address', property.address],
    ['City', property.city],
    ['Area', property.area ? `${property.area} ${property.area_unit ?? ''}` : null],
    ['Notes', property.notes],
  ].filter(([, v]) => v) as [string, string][]

  return (
    <>
      <Link to="/properties" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> Properties
      </Link>
      <PageHeader
        title={property.name ? `${property.code} · ${property.name}` : property.code}
        description={
          <span className="mt-1 inline-flex flex-wrap items-center gap-2">
            <PropertyStatusBadge status={summary.status} forSale={property.for_sale} />
            {property.for_sale && !sold && property.asking_price != null && (
              <span data-testid="asking-price">Asking {money(property.asking_price)}</span>
            )}
          </span>
        }
        actions={
          canWrite && (
            <>
              {!sold &&
                (property.for_sale ? (
                  <Button variant="outline" onClick={removeFromSale}>
                    <TagIcon /> Remove from sale
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setListing(true)}>
                    <TagIcon /> List for sale
                  </Button>
                ))}
              <Button variant="outline" size="icon" aria-label="Edit property" onClick={() => setEditing(true)}>
                <PencilIcon />
              </Button>
              <Button variant="outline" size="icon" aria-label="Delete property" onClick={onDelete}>
                <Trash2Icon />
              </Button>
            </>
          )
        }
      />

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
        <PropertyBreakdown propertyId={property.id} summary={summary} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Details</h2>
          <dl className="divide-y rounded-lg border text-sm">
            {details.map(([k, v]) => (
              <div key={k} className="flex gap-3 px-4 py-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words whitespace-pre-line">{v}</dd>
              </div>
            ))}
          </dl>
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

      <PropertyFormDialog
        open={editing}
        onOpenChange={setEditing}
        property={property}
        onSave={async (input) => {
          await updateProperty(current.id, property.id, input)
          await refresh()
          toast.success('Property updated')
        }}
      />
      <FormDialog
        open={listing}
        onOpenChange={setListing}
        title={`List ${property.code} for sale`}
        description="It stays in your portfolio (and can stay rented) until you record its sale."
        submitLabel="List for sale"
        schema={forSaleSchema}
        onSubmit={async ({ asking_price }) => {
          await updateProperty(current.id, property.id, { for_sale: true, asking_price })
          await refresh()
          toast.success('Listed for sale')
        }}
      >
        {(errors) => (
          <Field
            label={`Asking price (${current.currency})`}
            name="asking_price"
            inputMode="decimal"
            placeholder="15,000,000"
            defaultValue={property.asking_price ?? ''}
            error={errors.asking_price}
          />
        )}
      </FormDialog>
    </>
  )
}
