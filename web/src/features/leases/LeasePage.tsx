import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  BanknoteIcon,
  DoorOpenIcon,
  PencilIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { VoucherList } from '@/components/VoucherList'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchVouchersFor, propertyKeys } from '@/features/properties/api'
import { friendlyError } from '@/lib/forms'
import { formatMoney, isZero, today } from '@/lib/money'
import { cn } from '@/lib/utils'
import { deleteLease, fetchLease, leaseKeys, updateLease } from './api'
import { LeaseFormDialog } from './LeaseFormDialog'
import { endLabel, rentPosition } from './rentRoll'
import { endLeaseSchema } from './schema'

const STATUS_LABEL = { active: 'Current', upcoming: 'Upcoming', ended: 'Ended' }

export function LeasePage() {
  const { id = '' } = useParams()
  const { current, canWrite } = useOrg()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [ending, setEnding] = useState(false)

  const detail = useQuery({
    queryKey: leaseKeys.detail(current.id, id),
    queryFn: () => fetchLease(current.id, id),
  })
  const vouchers = useQuery({
    queryKey: ['vouchers', current.id, 'lease', id],
    queryFn: () => fetchVouchersFor(current.id, { lease_id: id }),
  })
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: leaseKeys.all(current.id) }),
      qc.invalidateQueries({ queryKey: propertyKeys.all(current.id) }),
    ])
  const m = (x: string) => formatMoney(x, current.currency)

  if (detail.isPending) return <SectionLoading label="Loading lease…" />
  if (detail.isError) return <SectionError error={detail.error} onRetry={() => detail.refetch()} />
  const { lease, roll } = detail.data
  if (!lease || !roll) {
    return (
      <>
        <PageHeader title="Lease not found" />
        <Link to="/leases" className="text-sm underline">
          Back to leases
        </Link>
      </>
    )
  }

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      await refresh()
      toast.success(done)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function onDelete() {
    if (!confirm(`Delete this lease of ${roll!.property_code}? This cannot be undone.`)) return
    try {
      await deleteLease(current.id, lease!.id)
      toast.success('Lease deleted')
      navigate('/leases', { replace: true })
      void refresh()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const pos = rentPosition(roll, current.currency)
  const kpis = [
    { label: 'Rent per month', value: m(roll.monthly_rent), testid: 'kpi-monthly-rent' },
    {
      label: `Rent received (${roll.months_due} ${roll.months_due === 1 ? 'month' : 'months'} due)`,
      value: m(roll.received),
      testid: 'kpi-received',
    },
    {
      label: 'Rent unpaid',
      value: roll.months_unpaid ? `${m(roll.arrears)} · ${roll.months_unpaid} mo` : m(roll.arrears),
      testid: 'kpi-unpaid',
      bad: roll.months_unpaid > 0,
    },
    {
      label: `Deposit held (agreed ${m(roll.security_deposit)})`,
      value: m(roll.deposit_held),
      testid: 'kpi-deposit',
    },
  ]
  const details = [
    [
      'Property',
      <Link key="p" to={`/properties/${roll.property_id}`} className="underline">
        {roll.property_code}
        {roll.property_name ? ` · ${roll.property_name}` : ''}
      </Link>,
    ],
    [
      'Tenant',
      <Link key="t" to={`/parties/${roll.party_id}`} className="underline">
        {roll.tenant_name}
      </Link>,
    ],
    ['Started', roll.start_date],
    ['Ends', endLabel(roll)],
    ['Rent due', `Day ${roll.rent_due_day} of each month`],
    [
      'Last rent',
      roll.last_rent_date && roll.last_rent_amount
        ? `${m(roll.last_rent_amount)} on ${roll.last_rent_date}`
        : 'None yet',
    ],
    ['Notes', lease.notes],
  ].filter(([, v]) => v) as [string, React.ReactNode][]
  const ended = roll.status === 'ended' && lease.ended_on

  return (
    <>
      <Link
        to="/leases"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden /> Leases &amp; Rent
      </Link>
      <PageHeader
        title={`${roll.property_code} · ${roll.tenant_name}`}
        description={
          <span
            className="mt-1 inline-flex flex-wrap items-center gap-2"
            data-testid="lease-status"
          >
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {STATUS_LABEL[roll.status]}
            </span>
            <span>{pos.label}</span>
          </span>
        }
        actions={
          canWrite && (
            <>
              <Link
                to={`/new/rent?lease_id=${lease.id}&amount=${roll.monthly_rent}`}
                className={buttonVariants()}
              >
                <BanknoteIcon /> Record rent
              </Link>
              <Link
                to={`/new/deposit?lease_id=${lease.id}${isZero(roll.security_deposit) ? '' : `&amount=${roll.security_deposit}`}`}
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                <ShieldCheckIcon /> Deposit
              </Link>
              {ended ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    run(
                      () => updateLease(current.id, lease.id, { ended_on: null }),
                      'Lease reopened',
                    )
                  }
                >
                  <RotateCcwIcon /> Reopen
                </Button>
              ) : (
                roll.status === 'active' && (
                  <Button variant="outline" onClick={() => setEnding(true)}>
                    <DoorOpenIcon /> End lease
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="icon"
                aria-label="Edit lease"
                onClick={() => setEditing(true)}
              >
                <PencilIcon />
              </Button>
              <Button variant="outline" size="icon" aria-label="Delete lease" onClick={onDelete}>
                <Trash2Icon />
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.testid} size="sm">
            <CardHeader>
              <CardDescription>{k.label}</CardDescription>
              <CardTitle
                className={cn('text-lg tabular-nums', k.bad && 'text-red-700')}
                data-testid={k.testid}
              >
                {k.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
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
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Rent &amp; deposit entries for this lease
          </h2>
          {vouchers.isPending ? (
            <SectionLoading label="Loading entries…" />
          ) : vouchers.isError ? (
            <SectionError error={vouchers.error} onRetry={() => vouchers.refetch()} />
          ) : (
            <VoucherList rows={vouchers.data} currency={current.currency} />
          )}
        </section>
      </div>

      <LeaseFormDialog
        open={editing}
        onOpenChange={setEditing}
        lease={lease}
        onSave={async (input) => {
          await updateLease(current.id, lease.id, input)
          await refresh()
          toast.success('Lease updated')
        }}
      />
      <FormDialog
        open={ending}
        onOpenChange={setEnding}
        title="End lease"
        description={`${roll.property_code} becomes vacant after this date. Rent stops falling due; anything unpaid stays on the rent roll.`}
        submitLabel="End lease"
        schema={endLeaseSchema}
        onSubmit={async ({ ended_on }) => {
          if (ended_on < roll.start_date) throw new Error('The lease cannot end before it starts.')
          await updateLease(current.id, lease.id, { ended_on })
          await refresh()
          toast.success('Lease ended')
        }}
      >
        {(errors) => (
          <Field
            label="Tenant left on"
            name="ended_on"
            type="date"
            max="2100-12-31"
            defaultValue={today()}
            error={errors.ended_on}
          />
        )}
      </FormDialog>
    </>
  )
}
