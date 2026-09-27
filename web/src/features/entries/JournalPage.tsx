import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, PlusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, NativeSelect } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchParties, partyKeys } from '@/features/parties/api'
import { fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { friendlyError } from '@/lib/forms'
import { ACCOUNT_TYPES } from '@/lib/labels'
import { formatMoney, sub, today } from '@/lib/money'
import { cn } from '@/lib/utils'
import { invalidateAfterPosting, postVoucher, previewVoucher, type Preview } from './api'
import { journalTotals, optionalAmount } from './lines'
import { LinesTable } from './PreviewPanel'

type Row = {
  key: number
  account_id: string
  debit: string
  credit: string
  property_id: string
  party_id: string
}
let nextKey = 1
const blank = (): Row => ({
  key: nextKey++,
  account_id: '',
  debit: '',
  credit: '',
  property_id: '',
  party_id: '',
})

/** Advanced: free debit/credit lines. Save stays disabled until the entry balances. */
export function JournalPage() {
  const { current } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [date, setDate] = useState(today())
  const [memo, setMemo] = useState('')
  const [rows, setRows] = useState<Row[]>([blank(), blank()])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<{
    payload: Record<string, unknown>
    preview: Preview
  } | null>(null)
  const accounts = useQuery({
    queryKey: accountKeys.all(current.id),
    queryFn: () => fetchAccounts(current.id),
  })
  const properties = useQuery({
    queryKey: propertyKeys.all(current.id),
    queryFn: () => fetchPropertySummaries(current.id),
  })
  const parties = useQuery({
    queryKey: partyKeys.all(current.id),
    queryFn: () => fetchParties(current.id),
  })

  if (accounts.isPending) return <SectionLoading />
  if (accounts.isError)
    return <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
  const totals = journalTotals(rows)
  const set = (key: number, patch: Partial<Row>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function onReview() {
    if (!memo.trim()) return setError('Add a note explaining this entry')
    setError(undefined)
    const lines = rows.map((r) => {
      const d = optionalAmount(r.debit)
      const c = optionalAmount(r.credit)
      return {
        account_id: r.account_id,
        ...(d && d !== 'invalid' && d !== '0.00' && { debit: d }),
        ...(c && c !== 'invalid' && c !== '0.00' && { credit: c }),
        ...(r.property_id && { property_id: r.property_id }),
        ...(r.party_id && { party_id: r.party_id }),
      }
    })
    const payload = { type: 'journal', date, memo: memo.trim(), lines }
    setBusy(true)
    try {
      setReview({ payload, preview: await previewVoucher(current.id, payload) })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSave() {
    if (!review) return
    setBusy(true)
    try {
      const posted = await postVoucher(current.id, review.payload)
      toast.success(`Saved as ${posted.number}`)
      navigate(`/entries/${posted.id}`, { replace: true })
      void invalidateAfterPosting(qc, current.id)
    } catch (err) {
      setReview(null)
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const difference = sub(totals.debit, totals.credit)
  return (
    <>
      <Link
        to="/new"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden /> New entry
      </Link>
      <PageHeader
        title="Journal entry"
        description="For corrections and adjustments your accountant needs. Debits must equal credits."
      />
      <Card className="max-w-3xl">
        <CardContent>
          {review ? (
            <div className="grid grid-cols-1 gap-4" data-testid="entry-preview">
              <p>
                Will be recorded as <strong>{review.preview.number}</strong>: {memo}
              </p>
              <LinesTable lines={review.preview.lines} currency={current.currency} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReview(null)} disabled={busy}>
                  Back
                </Button>
                <Button onClick={onSave} disabled={busy}>
                  {busy ? 'Saving…' : 'Save entry'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <Field
                  label="Date"
                  name="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <Field
                  label="Note"
                  name="memo"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="e.g. Correct January bank charges"
                />
              </div>
              {rows.map((r, i) => (
                <div
                  key={r.key}
                  className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                >
                  <NativeSelect
                    aria-label={`Account, line ${i + 1}`}
                    className="col-span-2 sm:col-span-1"
                    value={r.account_id}
                    onChange={(e) => set(r.key, { account_id: e.target.value })}
                  >
                    <option value="">Account…</option>
                    {ACCOUNT_TYPES.map((t) => (
                      <optgroup key={t.value} label={t.label}>
                        {accounts.data
                          .filter((a) => a.type === t.value && a.is_active)
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} {a.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </NativeSelect>
                  <Input
                    aria-label={`Debit, line ${i + 1}`}
                    inputMode="decimal"
                    placeholder="Debit"
                    value={r.debit}
                    onChange={(e) => set(r.key, { debit: e.target.value })}
                  />
                  <Input
                    aria-label={`Credit, line ${i + 1}`}
                    inputMode="decimal"
                    placeholder="Credit"
                    value={r.credit}
                    onChange={(e) => set(r.key, { credit: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={rows.length <= 2}
                    onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                  >
                    <XIcon />
                  </Button>
                  <NativeSelect
                    aria-label={`Property, line ${i + 1}`}
                    className="col-span-1 sm:col-span-2"
                    value={r.property_id}
                    onChange={(e) => set(r.key, { property_id: e.target.value })}
                  >
                    <option value="">No property</option>
                    {(properties.data ?? []).map((p) => (
                      <option key={p.property_id} value={p.property_id}>
                        {p.code}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label={`Party, line ${i + 1}`}
                    className="col-span-1"
                    value={r.party_id}
                    onChange={(e) => set(r.key, { party_id: e.target.value })}
                  >
                    <option value="">No party</option>
                    {(parties.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => setRows([...rows, blank()])}
              >
                <PlusIcon /> Add line
              </Button>
              <div
                className="flex flex-wrap justify-between gap-2 text-sm tabular-nums"
                data-testid="journal-totals"
              >
                <span>Debits {formatMoney(totals.debit, current.currency)}</span>
                <span>Credits {formatMoney(totals.credit, current.currency)}</span>
                <span
                  className={cn(difference === '0.00' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}
                >
                  {difference === '0.00'
                    ? 'Balanced'
                    : `Difference ${formatMoney(difference, current.currency)}`}
                </span>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end">
                <Button onClick={onReview} disabled={!totals.canSave || busy}>
                  {busy ? 'Checking…' : 'Review'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
