import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangleIcon, ArrowLeftIcon, PlusIcon, XIcon } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { useOrg } from '@/features/org/OrgProvider'
import { friendlyError } from '@/lib/forms'
import { today } from '@/lib/money'
import { entryKeys, fetchEntries, invalidateAfterPosting, postVoucher, previewVoucher, type Preview } from './api'
import { AmountField, HoldingPicker, PartyPicker, PropertyPicker } from './fields'
import { buildOpeningLines, type JournalLine, type OpeningInput } from './lines'
import { LinesTable } from './PreviewPanel'

type Section = 'properties' | 'holdings' | 'owedToUs' | 'weOwe' | 'deposits' | 'advances'
let nextKey = 1

/** One screen to carry your registers' balances into the system on a cut-over date. */
export function OpeningBalancesPage() {
  const { current } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const formRef = useRef<HTMLFormElement>(null)
  const [rows, setRows] = useState<Record<Section, number[]>>({
    properties: [nextKey++],
    holdings: [nextKey++],
    owedToUs: [nextKey++],
    weOwe: [nextKey++],
    deposits: [nextKey++],
    advances: [nextKey++],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<{ payload: Record<string, unknown>; preview: Preview } | null>(null)

  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
  const existing = useQuery({
    queryKey: [...entryKeys.all(current.id), { type: 'opening' }],
    queryFn: () => fetchEntries(current.id, { type: 'opening' }),
  })

  if (accounts.isPending) return <SectionLoading />
  if (accounts.isError) return <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
  const money = accounts.data.filter((a) => (a.subtype === 'cash' || a.subtype === 'bank') && a.is_active)
  const sys = (key: string) => accounts.data.find((a) => a.system_key === key)!.id
  const hasOpening = (existing.data ?? []).some((v) => v.status === 'posted' && !v.reverses_id)

  async function onReview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const get = (k: string) => String(fd.get(k) ?? '')
    const input: OpeningInput = {
      money: money.map((a) => ({ account_id: a.id, amount: get(`money_${a.id}`) })),
      properties: rows.properties.map((k) => ({ property_id: get(`prop_${k}`), cost: get(`propcost_${k}`) })),
      holdings: rows.holdings.map((k) => ({
        holding_id: get(`hold_${k}`),
        holding_class: get(`holdcls_${k}`),
        cost: get(`holdcost_${k}`),
        weight: get(`holdw_${k}`),
        unit: get(`holdu_${k}`),
      })),
      owedToUs: rows.owedToUs.map((k) => ({ party_id: get(`recv_${k}`), amount: get(`recvamt_${k}`), property_id: get(`recvprop_${k}`) })),
      weOwe: rows.weOwe.map((k) => ({ party_id: get(`pay_${k}`), amount: get(`payamt_${k}`), property_id: get(`payprop_${k}`) })),
      deposits: rows.deposits.map((k) => ({ party_id: get(`dep_${k}`), property_id: get(`depprop_${k}`), amount: get(`depamt_${k}`) })),
      advances: rows.advances.map((k) => ({ party_id: get(`adv_${k}`), property_id: get(`advprop_${k}`), amount: get(`advamt_${k}`) })),
    }
    const { lines, errors } = buildOpeningLines(input, {
      properties: sys('properties'),
      receivable: sys('receivable_buyers'),
      payable: sys('payable_sellers'),
      deposits: sys('deposits_held'),
      advances: sys('advances_buyers'),
      holdings: { vehicle: sys('vehicles'), gold: sys('gold'), silver: sys('silver') },
    })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(get('date'))) errors.date = 'Pick the cut-over date'
    if (Object.keys(errors).length) return setErrors(errors)
    setErrors({})
    const payload = { type: 'opening', date: get('date'), memo: 'Opening balances', lines: lines as JournalLine[] }
    setBusy(true)
    try {
      setReview({ payload, preview: await previewVoucher(current.id, payload) })
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
      const posted = await postVoucher(current.id, review.payload)
      toast.success(`Opening balances saved as ${posted.number}`)
      navigate('/', { replace: true })
      void invalidateAfterPosting(qc, current.id)
    } catch (err) {
      setReview(null)
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  // Row keys are indexes into `rows[section]`; errors are keyed `${section}.${index}`.
  const rowList = (section: Section, render: (k: number, i: number) => React.ReactNode, addLabel: string) => (
    <div className="grid grid-cols-1 gap-3">
      {rows[section].map((k, i) => (
        <div key={k} className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
          {render(k, i)}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="justify-self-end sm:mt-7"
            aria-label="Remove row"
            onClick={() => setRows({ ...rows, [section]: rows[section].filter((x) => x !== k) })}
          >
            <XIcon />
          </Button>
          {errors[`${section}.${i}`] && <p className="text-sm text-destructive sm:col-span-3">{errors[`${section}.${i}`]}</p>}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setRows({ ...rows, [section]: [...rows[section], nextKey++] })}>
        <PlusIcon /> {addLabel}
      </Button>
    </div>
  )

  return (
    <>
      <Link to="/new" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> New entry
      </Link>
      <PageHeader
        title="Opening balances"
        description="Carry over what your registers show on the day you start using this system. Leave anything you don't have empty."
      />
      {hasOpening && (
        <div role="alert" className="mb-4 flex max-w-2xl items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          Opening balances were already recorded. Saving again adds to them. To change them, void the earlier entry first.
        </div>
      )}
      <Card className="max-w-2xl">
        <CardContent>
          <form ref={formRef} onSubmit={onReview} noValidate className={review ? 'hidden' : 'grid grid-cols-1 gap-6'}>
            <Field label="Cut-over date" name="date" type="date" defaultValue={today()} error={errors.date} hint="Balances as at the end of this day" />
            <section className="grid grid-cols-1 gap-3">
              <h2 className="font-semibold">Cash &amp; bank</h2>
              {money.map((a, i) => (
                <div key={a.id}>
                  <AmountField name={`money_${a.id}`} label={a.name} error={errors[`money.${i}`]} />
                </div>
              ))}
              <p className="text-sm text-muted-foreground">
                Missing an account? <Link className="underline" to="/settings/accounts/money">Add it in Settings</Link> first.
              </p>
            </section>
            <section className="grid grid-cols-1 gap-3">
              <h2 className="font-semibold">Properties you already own</h2>
              {rowList(
                'properties',
                (k) => (
                  <>
                    <PropertyPicker name={`prop_${k}`} label="Property" unsoldOnly allowCreate />
                    <AmountField name={`propcost_${k}`} label="Total cost so far" />
                  </>
                ),
                'Add property',
              )}
            </section>
            <section className="grid grid-cols-1 gap-3">
              <h2 className="font-semibold">Vehicles, gold &amp; silver you already own</h2>
              <p className="-mt-2 text-sm text-muted-foreground">What each cost you, and for gold or silver the weight you hold.</p>
              {rowList(
                'holdings',
                (k) => (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <HoldingPicker
                        name={`hold_${k}`}
                        label="Vehicle or item"
                        unsoldOnly
                        allowCreate
                        weight="buy"
                        weightLabel="Weight held"
                        names={{ cls: `holdcls_${k}`, weight: `holdw_${k}`, unit: `holdu_${k}`, whole: `holdwh_${k}` }}
                      />
                    </div>
                    <AmountField name={`holdcost_${k}`} label="Total cost so far" />
                  </>
                ),
                'Add vehicle or item',
              )}
            </section>
            <section className="grid grid-cols-1 gap-3">
              <h2 className="font-semibold">Money others owe you</h2>
              {rowList(
                'owedToUs',
                (k) => (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <PartyPicker name={`recv_${k}`} label="Buyer" roles={['buyer']} allowCreate />
                      <PropertyPicker name={`recvprop_${k}`} label="For property (optional)" optional />
                    </div>
                    <AmountField name={`recvamt_${k}`} label="Amount owed" />
                  </>
                ),
                'Add someone who owes you',
              )}
            </section>
            <section className="grid grid-cols-1 gap-3">
              <h2 className="font-semibold">Money you owe</h2>
              {rowList(
                'weOwe',
                (k) => (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <PartyPicker name={`pay_${k}`} label="Seller" roles={['seller']} allowCreate />
                      <PropertyPicker name={`payprop_${k}`} label="For property (optional)" optional />
                    </div>
                    <AmountField name={`payamt_${k}`} label="Amount you owe" />
                  </>
                ),
                'Add someone you owe',
              )}
            </section>
            <section className="grid grid-cols-1 gap-3">
              <h2 className="font-semibold">Security deposits you hold</h2>
              <p className="-mt-2 text-sm text-muted-foreground">Deposits tenants paid you that you will refund when they leave.</p>
              {rowList(
                'deposits',
                (k) => (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <PartyPicker name={`dep_${k}`} label="Tenant" roles={['tenant']} allowCreate />
                      <PropertyPicker name={`depprop_${k}`} label="Property" />
                    </div>
                    <AmountField name={`depamt_${k}`} label="Deposit held" />
                  </>
                ),
                'Add a deposit',
              )}
            </section>
            <section className="grid grid-cols-1 gap-3">
              <h2 className="font-semibold">Token money received</h2>
              <p className="-mt-2 text-sm text-muted-foreground">
                Bayana for sales not completed yet. It is applied automatically when you record the sale.
              </p>
              {rowList(
                'advances',
                (k) => (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <PartyPicker name={`adv_${k}`} label="Buyer" roles={['buyer']} allowCreate />
                      <PropertyPicker name={`advprop_${k}`} label="Property" unsoldOnly />
                    </div>
                    <AmountField name={`advamt_${k}`} label="Token money" />
                  </>
                ),
                'Add token money',
              )}
            </section>
            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Review'}
              </Button>
            </div>
          </form>
          {review && (
            <div className="grid grid-cols-1 gap-4" data-testid="entry-preview">
              <p>
                These balances will be recorded as <strong>{review.preview.number}</strong>. The difference goes to
                Opening Balance Equity (your starting capital).
              </p>
              <LinesTable lines={review.preview.lines} currency={current.currency} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReview(null)} disabled={busy}>
                  Back
                </Button>
                <Button onClick={onSave} disabled={busy}>
                  {busy ? 'Saving…' : 'Save opening balances'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
