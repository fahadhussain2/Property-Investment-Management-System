import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { propertyKeys } from '@/features/properties/api'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { createLease, fetchRentRoll, leaseKeys } from './api'
import { LeaseFormDialog } from './LeaseFormDialog'
import { filterRoll, parseRollFilter, ROLL_FILTERS, rollTotals } from './rentRoll'
import { RollList } from './RollList'

/** Leases & rent roll (spec §6.7): who pays what, what is unpaid, and what ends soon. */
export function LeasesPage() {
  const { current, canWrite } = useOrg()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const filter = parseRollFilter(params.get('show'))
  const roll = useQuery({
    queryKey: leaseKeys.roll(current.id),
    queryFn: () => fetchRentRoll(current.id),
  })
  const m = (x: string) => formatMoney(x, current.currency)

  const header = (
    <PageHeader
      title="Leases & Rent"
      description="Rent per lease, what is unpaid, and leases ending soon."
      actions={
        canWrite && (
          <Button onClick={() => setAdding(true)}>
            <PlusIcon /> New lease
          </Button>
        )
      }
    />
  )
  const dialog = (
    <LeaseFormDialog
      open={adding}
      onOpenChange={setAdding}
      onSave={async (input) => {
        const lease = await createLease(current.id, input)
        toast.success('Lease added')
        navigate(`/leases/${lease.id}`)
        void qc.invalidateQueries({ queryKey: leaseKeys.all(current.id) })
        void qc.invalidateQueries({ queryKey: propertyKeys.all(current.id) })
      }}
    />
  )

  if (roll.isPending)
    return (
      <>
        {header}
        <SectionLoading label="Loading leases…" />
        {dialog}
      </>
    )
  if (roll.isError)
    return (
      <>
        {header}
        <SectionError error={roll.error} onRetry={() => roll.refetch()} />
        {dialog}
      </>
    )

  const totals = rollTotals(roll.data)
  const rows = filterRoll(roll.data, filter)

  return (
    <>
      {header}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Rent per month (current leases)</CardDescription>
            <CardTitle className="text-xl tabular-nums" data-testid="roll-monthly">
              {m(totals.monthlyRent)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>
              Rent unpaid
              {totals.owingCount
                ? ` (${totals.owingCount} ${totals.owingCount === 1 ? 'lease' : 'leases'})`
                : ''}
            </CardDescription>
            <CardTitle
              className={cn('text-xl tabular-nums', totals.owingCount > 0 && 'text-red-700')}
              data-testid="roll-arrears"
            >
              {m(totals.arrears)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div role="tablist" aria-label="Show" className="mb-3 flex flex-wrap gap-2">
        {ROLL_FILTERS.map((f) => (
          <Button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() =>
              setParams(f.value === 'current' ? {} : { show: f.value }, { replace: true })
            }
          >
            {f.label}
          </Button>
        ))}
      </div>

      <RollList
        rows={rows}
        currency={current.currency}
        empty={
          roll.data.length === 0
            ? 'Add a lease when you rent out a property. Its rent then shows here every month.'
            : 'Nothing matches this view.'
        }
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Months unpaid count each rent due date (the lease’s due day) up to today, against the rent
        recorded for the lease.
      </p>
      {dialog}
    </>
  )
}
