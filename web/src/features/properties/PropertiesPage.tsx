import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2Icon, PlusIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { NativeSelect } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { PropertyStatusBadge } from '@/components/StatusBadge'
import { useOrg } from '@/features/org/OrgProvider'
import { kindLabel, PROPERTY_KINDS, type PropertyKind } from '@/lib/labels'
import { formatMoney, toMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { createProperty, fetchPropertySummaries, propertyKeys, type PropertySummary } from './api'
import { filterProperties, STATUS_FILTERS, statusCounts, type StatusFilter } from './filter'
import { PropertyFormDialog } from './PropertyFormDialog'

export function PropertiesPage() {
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const initial = params.get('status') as StatusFilter | null
  const [status, setStatus] = useState<StatusFilter>(
    initial && STATUS_FILTERS.some((f) => f.value === initial) ? initial : 'all',
  )
  const [kind, setKind] = useState<PropertyKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const list = useQuery({
    queryKey: propertyKeys.all(current.id),
    queryFn: () => fetchPropertySummaries(current.id),
  })
  const rows = useMemo(() => filterProperties(list.data ?? [], { status, kind, q }), [list.data, status, kind, q])
  const counts = useMemo(() => statusCounts(list.data ?? []), [list.data])
  const money = (v: number) => formatMoney(toMoney(v), current.currency)

  return (
    <>
      <PageHeader
        title="Properties"
        description="Everything you own, rent out, are selling or have sold"
        actions={
          canWrite && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Add property
            </Button>
          )
        }
      />

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
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search properties"
            placeholder="Search code or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <NativeSelect
          aria-label="Filter by type"
          value={kind}
          onChange={(e) => setKind(e.target.value as PropertyKind | 'all')}
          className="w-36"
        >
          <option value="all">All types</option>
          {PROPERTY_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {list.isPending ? (
        <SectionLoading label="Loading properties…" />
      ) : list.isError ? (
        <SectionError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Building2Icon} title="No properties yet">
          {canWrite ? 'Add your first property to start its financial history.' : 'Nothing has been added yet.'}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No properties match these filters" />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="grid grid-cols-1 gap-2 md:hidden" data-testid="property-cards">
            {rows.map((p) => (
              <li key={p.property_id}>
                <Link to={`/properties/${p.property_id}`} className="block rounded-lg border p-3 hover:bg-accent">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{p.code}</div>
                      <div className="truncate text-sm text-muted-foreground">
                        {kindLabel(p.kind)}
                        {p.name ? ` · ${p.name}` : ''}
                      </div>
                    </div>
                    <PropertyStatusBadge status={p.status} forSale={p.for_sale} />
                  </div>
                  <div className="mt-2 flex justify-between text-sm tabular-nums">
                    <span className="text-muted-foreground">Cost {money(p.cost)}</span>
                    <span>Profit {money(p.net_profit)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <table className="w-full text-sm" data-testid="property-table">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                  <th className="px-4 py-2 text-right font-medium">Net profit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p: PropertySummary) => (
                  <tr key={p.property_id} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/properties/${p.property_id}`)}>
                    <td className="px-4 py-2 font-semibold">
                      <Link to={`/properties/${p.property_id}`} onClick={(e) => e.stopPropagation()}>
                        {p.code}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{p.name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2">{kindLabel(p.kind)}</td>
                    <td className="px-4 py-2">
                      <PropertyStatusBadge status={p.status} forSale={p.for_sale} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(p.cost)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(p.net_profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PropertyFormDialog
        open={adding}
        onOpenChange={setAdding}
        onSave={async (input) => {
          const created = await createProperty(current.id, input)
          await queryClient.invalidateQueries({ queryKey: propertyKeys.all(current.id) })
          toast.success(`${created.code} added`)
          navigate(`/properties/${created.id}`)
        }}
      />
    </>
  )
}
