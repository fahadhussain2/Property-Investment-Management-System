import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, PencilIcon, Undo2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { fetchMembers, memberKeys } from '@/features/members/api'
import { useOrg } from '@/features/org/OrgProvider'
import { VOUCHER_TYPES } from '@/lib/labels'
import { formatMoney, sub } from '@/lib/money'
import { entryKeys, fetchEntry, invalidateAfterPosting, reverseVoucher } from './api'
import { LinesTable, ProfitBanner } from './PreviewPanel'
import { entryType } from './types'

const voidSchema = z.object({ reason: z.string().trim().min(3, 'Say briefly why, e.g. "entered twice"').max(200) })

const ACTIONS: Record<string, string> = { post: 'Recorded', reverse: 'Voided', edit: 'Corrected' }

export function EntryPage() {
  const { id = '' } = useParams()
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [voiding, setVoiding] = useState(false)
  const entry = useQuery({ queryKey: entryKeys.detail(id), queryFn: () => fetchEntry(id) })
  const members = useQuery({ queryKey: memberKeys.members(current.id), queryFn: () => fetchMembers(current.id) })

  if (entry.isPending) return <SectionLoading label="Loading entry…" />
  if (entry.isError) return <SectionError error={entry.error} onRetry={() => entry.refetch()} />
  const e = entry.data
  if (!e) {
    return (
      <>
        <PageHeader title="Entry not found" />
        <Link to="/entries" className="text-sm underline">
          Back to entries
        </Link>
      </>
    )
  }

  if (e.org_id !== current.id) {
    return (
      <>
        <PageHeader title="This entry belongs to another business" description="Switch business (top left) to view it." />
        <Link to="/entries" className="text-sm underline">
          Back to entries
        </Link>
      </>
    )
  }

  const email = (uid: string | null) => members.data?.find((m) => m.user_id === uid)?.email ?? 'someone'
  const isReversal = !!e.reverses
  const active = e.status === 'posted' && !isReversal
  const editable = active && !!entryType(e.type) && !!e.payload
  // Cost of Properties Sold (code 5000; codes are immutable) carries the cost moved out on sale.
  // A property with no recorded cost has no such line: its cost is zero and the whole price is profit.
  const cost = e.type === 'sale' ? (e.lines.find((l) => l.code === '5000' && l.debit !== '0.00')?.debit ?? '0.00') : undefined
  const profit = cost !== undefined ? sub(e.amount, cost) : undefined

  return (
    <>
      <Link to="/entries" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> Entries
      </Link>
      <PageHeader
        title={`${VOUCHER_TYPES[e.type]} · ${e.number}`}
        description={
          <span className="mt-1 inline-flex flex-wrap items-center gap-2">
            <span>{new Date(e.date + 'T00:00:00').toLocaleDateString()}</span>
            <span className="font-medium text-foreground tabular-nums">{formatMoney(e.amount, current.currency)}</span>
            {e.status === 'reversed' && <Badge variant="destructive">Voided</Badge>}
            {isReversal && <Badge variant="outline">Reversal</Badge>}
          </span>
        }
        actions={
          canWrite &&
          active && (
            <>
              {editable && (
                <Link to={`/entries/${e.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
                  <PencilIcon /> Correct
                </Link>
              )}
              <Button variant="outline" onClick={() => setVoiding(true)}>
                <Undo2Icon /> Void
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 gap-4">
          {(e.reverses || e.reversed_by || e.replaced_by || e.replaces) && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="entry-links">
              {e.reverses && <p>This reverses <Link className="underline" to={`/entries/${e.reverses.id}`}>{e.reverses.number}</Link>.</p>}
              {e.reversed_by && <p>Voided by <Link className="underline" to={`/entries/${e.reversed_by.id}`}>{e.reversed_by.number}</Link>.</p>}
              {e.replaced_by && <p>Corrected: see <Link className="underline" to={`/entries/${e.replaced_by.id}`}>{e.replaced_by.number}</Link>.</p>}
              {e.replaces && <p>Correction of <Link className="underline" to={`/entries/${e.replaces.id}`}>{e.replaces.number}</Link>.</p>}
            </div>
          )}
          {e.memo && <p className="text-sm">{e.memo}</p>}
          <dl className="grid grid-cols-1 gap-1 text-sm">
            {e.property && (
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">Property</dt>
                <dd><Link className="underline" to={`/properties/${e.property.id}`}>{e.property.code}{e.property.name ? ` · ${e.property.name}` : ''}</Link></dd>
              </div>
            )}
            {e.party && (
              <div className="flex gap-2">
                <dt className="w-20 text-muted-foreground">Party</dt>
                <dd><Link className="underline" to={`/parties/${e.party.id}`}>{e.party.name}</Link></dd>
              </div>
            )}
          </dl>
          {profit !== undefined && active && <ProfitBanner profit={profit} cost={cost} currency={current.currency} />}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Accounting entries</h2>
            <LinesTable lines={e.lines} currency={current.currency} />
          </section>
        </div>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">History</h2>
          <ol className="grid grid-cols-1 gap-2 text-sm" data-testid="entry-history">
            {e.history.map((h, i) => (
              <li key={i} className="rounded-md border p-2">
                <div className="font-medium">{ACTIONS[h.action] ?? h.action}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(h.at).toLocaleString()} · {email(h.user_id)}
                  {typeof h.details?.reason === 'string' && h.details.reason ? ` · “${h.details.reason}”` : ''}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <FormDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={`Void ${e.number}?`}
        description="A reversing entry cancels its effect. Nothing is deleted: both stay in the history."
        submitLabel="Void entry"
        schema={voidSchema}
        onSubmit={async ({ reason }) => {
          await reverseVoucher(e.id, reason)
          await invalidateAfterPosting(qc, current.id)
          toast.success(`${e.number} voided`)
          navigate(`/entries/${e.id}`, { replace: true })
        }}
      >
        {(errors) => <Field label="Reason" name="reason" autoComplete="off" error={errors.reason} />}
      </FormDialog>
    </>
  )
}
