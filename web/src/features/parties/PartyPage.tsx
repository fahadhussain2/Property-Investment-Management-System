import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { VoucherList } from '@/components/VoucherList'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchVouchersFor } from '@/features/properties/api'
import { friendlyError } from '@/lib/forms'
import { roleLabel } from '@/lib/labels'
import { deleteParty, fetchParty, partyKeys, updateParty } from './api'
import { PartyFormDialog } from './PartyFormDialog'

export function PartyPage() {
  const { id = '' } = useParams()
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const party = useQuery({ queryKey: partyKeys.detail(current.id, id), queryFn: () => fetchParty(current.id, id) })
  const vouchers = useQuery({
    queryKey: ['vouchers', current.id, 'party', id],
    queryFn: () => fetchVouchersFor(current.id, { party_id: id }),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: partyKeys.all(current.id) })

  if (party.isPending) return <SectionLoading label="Loading…" />
  if (party.isError) return <SectionError error={party.error} onRetry={() => party.refetch()} />
  const p = party.data
  if (!p) {
    return (
      <>
        <PageHeader title="Party not found" />
        <Link to="/parties" className="text-sm underline">
          Back to parties
        </Link>
      </>
    )
  }

  async function onDelete() {
    if (!confirm(`Delete ${p!.name}? This cannot be undone.`)) return
    try {
      await deleteParty(current.id, p!.id)
      await refresh()
      toast.success(`${p!.name} deleted`)
      navigate('/parties', { replace: true })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const details = [
    ['Phone', p.phone],
    ['Email', p.email],
    ['CNIC', p.cnic],
    ['Address', p.address],
    ['Notes', p.notes],
  ].filter(([, v]) => v) as [string, string][]

  return (
    <>
      <Link to="/parties" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> Parties
      </Link>
      <PageHeader
        title={p.name}
        description={
          <span className="mt-1 inline-flex flex-wrap gap-1">
            {p.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {roleLabel(r)}
              </Badge>
            ))}
          </span>
        }
        actions={
          canWrite && (
            <>
              <Button variant="outline" size="icon" aria-label="Edit party" onClick={() => setEditing(true)}>
                <PencilIcon />
              </Button>
              <Button variant="outline" size="icon" aria-label="Delete party" onClick={onDelete}>
                <Trash2Icon />
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Details</h2>
          {details.length ? (
            <dl className="divide-y rounded-lg border text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="flex gap-3 px-4 py-2">
                  <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No contact details yet.</p>
          )}
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
      <PartyFormDialog
        open={editing}
        onOpenChange={setEditing}
        party={p}
        onSave={async (input) => {
          await updateParty(current.id, p.id, input)
          await refresh()
          toast.success('Saved')
        }}
      />
    </>
  )
}
