import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon } from 'lucide-react'
import { Fragment, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { fetchHoldings, holdingKeys } from '@/features/holdings/api'
import { fetchRentRoll, leaseKeys } from '@/features/leases/api'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchParties, partyKeys } from '@/features/parties/api'
import { fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { friendlyError, type FieldErrors } from '@/lib/forms'
import { today } from '@/lib/money'
import { editVoucher, fetchEntry, invalidateAfterPosting, postVoucher, previewEdit, previewVoucher, type Preview } from './api'
import { AmountField, CategoryPicker, DirectionField, HoldingPicker, LeasePicker, MoneyAccountPicker, PartyPicker, PropertyPicker } from './fields'
import { buildPayload, payloadToValues, type FormValues, type Payload } from './payload'
import { PreviewPanel } from './PreviewPanel'
import { summarize } from './summary'
import { entryType, type EntryType, type EntryVariant, type FieldSpec } from './types'

/** "Bought a vehicle" / "Bought gold or silver": the same form, its item picker narrowed to that class. */
function withVariant(config: EntryType, v: EntryVariant): EntryType {
  return {
    ...config,
    action: v.action,
    help: v.help,
    fields: config.fields.map((f) => (f.kind === 'holding' ? { ...f, holdingClass: v.class, label: v.holdingLabel } : f)),
  }
}

/** /new/:type (record) and /entries/:id/edit (correct an existing entry). */
export function EntryFormPage() {
  const { type, id } = useParams()
  const [params] = useSearchParams()
  // Own cache key (not under ['entry']), fetched once. After a correction is saved, the refresh of
  // ['entry'] must not reach this page: seeing its original now "voided", it would redirect back to it,
  // racing (and, under load, beating) the navigation to the corrected entry.
  const entry = useQuery({
    queryKey: ['entry-edit', id],
    queryFn: () => fetchEntry(id!),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 0,
  })

  if (id) {
    if (entry.isPending) return <SectionLoading label="Loading entry…" />
    if (entry.isError) return <SectionError error={entry.error} onRetry={() => entry.refetch()} />
    const e = entry.data
    const config = e && entryType(e.type)
    if (!e || !config || e.status !== 'posted' || e.reverses) return <Navigate to={`/entries/${id}`} replace />
    return <EntryForm config={config} initial={payloadToValues(e.payload)} editing={{ id: e.id, number: e.number }} />
  }
  const base = entryType(type ?? '')
  if (!base) return <Navigate to="/new" replace />
  const variant = base.variants?.find((v) => v.class === params.get('class'))
  const config = variant ? withVariant(base, variant) : base
  // Links may prefill a new entry, e.g. "Record rent" on a lease: /new/rent?lease_id=…&amount=50000.00
  const prefill = Object.fromEntries(config.fields.filter((f) => params.get(f.name)).map((f) => [f.name, params.get(f.name)!]))
  // Coming from a lease ("Record rent" / "Deposit"), the lease is fixed: changing it there is always a slip.
  return (
    <EntryForm
      key={`${config.type}-${variant?.class ?? ''}`}
      config={config}
      initial={{ date: today(), ...prefill }}
      lockLease={!!prefill.lease_id}
    />
  )
}

function renderField(f: FieldSpec, values: FormValues, errors: FieldErrors, config: EntryType, lockLease?: boolean) {
  if (f.inLease) return null // drawn by the lease picker
  const common = { name: f.name, label: f.label, hint: f.hint, error: errors[f.name], defaultValue: values[f.name] }
  switch (f.kind) {
    case 'date':
      return <Field {...common} type="date" max="2100-12-31" />
    case 'memo':
      return <Field {...common} autoComplete="off" />
    case 'period':
      return <Field {...common} type="month" />
    case 'money':
    case 'optional_money':
      return <AmountField {...common} />
    case 'property':
      return <PropertyPicker {...common} unsoldOnly={f.unsoldOnly} optional={f.optional} allowCreate={f.allowCreate} />
    case 'party':
      return <PartyPicker {...common} roles={f.roles} allowCreate={f.allowCreate} />
    case 'money_account':
    case 'to_account':
      return <MoneyAccountPicker {...common} />
    case 'category':
      return <CategoryPicker {...common} categoryType={f.categoryType!} />
    case 'direction':
      return <DirectionField {...common} />
    case 'holding':
      return (
        <HoldingPicker
          {...common}
          holdingClass={f.holdingClass}
          unsoldOnly={f.unsoldOnly}
          optional={f.optional}
          allowCreate={f.allowCreate}
          weight={f.weight}
          weightValues={{ weight: values.weight, unit: values.unit, whole: values.whole }}
          weightError={errors.weight}
        />
      )
    case 'lease': {
      const picked = (name: string) => {
        const s = config.fields.find((x) => x.name === name)!
        return { label: s.label, error: errors[name], defaultValue: values[name], unsoldOnly: s.unsoldOnly, roles: s.roles, allowCreate: s.allowCreate }
      }
      return <LeasePicker {...common} locked={lockLease} property={picked('property_id')} party={picked('party_id')} />
    }
  }
}

function EntryForm({
  config,
  initial,
  editing,
  lockLease,
}: {
  config: EntryType
  initial: FormValues
  editing?: { id: string; number: string }
  lockLease?: boolean
}) {
  const { current } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<{ payload: Payload; preview: Preview } | null>(null)

  // For the plain-language summary.
  const properties = useQuery({ queryKey: propertyKeys.all(current.id), queryFn: () => fetchPropertySummaries(current.id) })
  const parties = useQuery({ queryKey: partyKeys.all(current.id), queryFn: () => fetchParties(current.id) })
  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
  const hasLease = config.fields.some((f) => f.kind === 'lease')
  const leases = useQuery({ queryKey: leaseKeys.roll(current.id), queryFn: () => fetchRentRoll(current.id), enabled: hasLease })
  const hasHolding = config.fields.some((f) => f.kind === 'holding')
  const holdings = useQuery({ queryKey: holdingKeys.all(current.id), queryFn: () => fetchHoldings(current.id), enabled: hasHolding })
  // Review reads the form and names things in its summary, so wait until these have arrived (or failed:
  // an error is not "loading"). Before this, a quick click on a slow connection was rejected with
  // "Choose a cash or bank account" while the saved account was visibly selected.
  const loading =
    properties.isPending || parties.isPending || accounts.isPending || (hasLease && leases.isPending) || (hasHolding && holdings.isPending)

  async function onReview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as FormValues
    const built = buildPayload(config, values)
    if (built.errors) return setErrors(built.errors)
    setErrors({})
    setBusy(true)
    try {
      const preview = editing
        ? await previewEdit(editing.id, built.payload)
        : await previewVoucher(current.id, built.payload)
      setReview({ payload: built.payload, preview })
    } catch (err) {
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  async function onSave() {
    if (!review) return
    setBusy(true)
    try {
      const posted = editing
        ? await editVoucher(editing.id, review.payload)
        : await postVoucher(current.id, review.payload)
      toast.success(editing ? `${editing.number} corrected as ${posted.number}` : `Saved as ${posted.number}`)
      // Navigate BEFORE refreshing: when correcting, the refreshed original is "voided" and this edit
      // page would redirect back to it, overriding the navigation to the corrected entry.
      navigate(`/entries/${posted.id}`, { replace: true })
      void invalidateAfterPosting(qc, current.id)
    } catch (err) {
      setReview(null)
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  const names = (p: Payload) => ({
    property: properties.data?.find((x) => x.property_id === p.property_id)?.code,
    party: parties.data?.find((x) => x.id === p.party_id)?.name,
    account: accounts.data?.find((x) => x.id === p.account_id)?.name,
    toAccount: accounts.data?.find((x) => x.id === p.to_account_id)?.name,
    category: accounts.data?.find((x) => x.id === p.category_account_id)?.name,
    holding: holdings.data?.find((x) => x.id === p.holding_id)?.code,
  })

  return (
    <>
      <Link to={editing ? `/entries/${editing.id}` : '/new'} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> {editing ? editing.number : 'New entry'}
      </Link>
      <PageHeader
        title={editing ? `Correct ${editing.number}` : config.action}
        description={editing ? 'The original is reversed and a corrected entry is recorded. Both stay in the history.' : config.help}
      />
      <Card className="max-w-2xl">
        <CardContent>
          {/* The form stays mounted (hidden) during review, so "Back" keeps every value. */}
          <form ref={formRef} onSubmit={onReview} noValidate className={review ? 'hidden' : 'grid grid-cols-1 gap-4'}>
            {config.fields.map((f) => (
              <Fragment key={f.name}>{renderField(f, initial, errors, config, lockLease)}</Fragment>
            ))}
            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || loading} aria-busy={loading}>
                {busy ? 'Checking…' : 'Review'}
              </Button>
            </div>
          </form>
          {review && (
            <div className="grid grid-cols-1 gap-4">
              <PreviewPanel
                summary={summarize(config.type, review.payload, names(review.payload), current.currency)}
                number={review.preview.number}
                lines={review.preview.lines}
                profit={review.preview.profit}
                cost={review.preview.cost}
                costLabel={config.type === 'holding_sale' ? 'Cost of what was sold' : undefined}
                currency={current.currency}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReview(null)} disabled={busy}>
                  Back
                </Button>
                <Button onClick={onSave} disabled={busy}>
                  {busy ? 'Saving…' : editing ? 'Save correction' : 'Save entry'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
