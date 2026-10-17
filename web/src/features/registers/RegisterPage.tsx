import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveIcon, ArchiveRestoreIcon, ArrowLeftIcon, DownloadIcon, PencilIcon, PlusIcon, PrinterIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchMembers, memberKeys } from '@/features/members/api'
import { downloadCsv, slug, toCsv } from '@/lib/csv'
import { formatDateTime } from '@/lib/dates'
import { friendlyError } from '@/lib/forms'
import { formatMoney, isNegative } from '@/lib/money'
import { cn } from '@/lib/utils'
import { addEntry, correctEntry, deleteRegister, fetchLedger, fetchRegister, registerKeys, updateRegister, voidEntry } from './api'
import { EntryFormDialog, VoidEntryDialog } from './EntryFormDialog'
import { Ledger } from './Ledger'
import { registerCsv, type LedgerLine } from './model'
import { RegisterFormDialog } from './RegisterFormDialog'

const Figure = ({ label, value, testid, negative }: { label: string; value: string; testid: string; negative?: boolean }) => (
  <div className="rounded-xl border bg-card p-4">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className={cn('text-lg font-semibold tabular-nums sm:text-2xl', negative && 'text-red-700 dark:text-red-400')} data-testid={testid}>
      {value}
    </div>
  </div>
)

/** One register: three figures and its ledger, oldest first, with the balance after every line. */
export function RegisterPage() {
  const { id = '' } = useParams()
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [correcting, setCorrecting] = useState<LedgerLine | null>(null)
  const [voiding, setVoiding] = useState<LedgerLine | null>(null)
  // A dialog keeps its content while it fades out: remember the line, or a corrected line's dialog would turn into
  // "Add an entry" for a moment as it closes.
  const lastCorrecting = useRef<LedgerLine | null>(null)
  const lastVoiding = useRef<LedgerLine | null>(null)
  if (correcting) lastCorrecting.current = correcting
  if (voiding) lastVoiding.current = voiding

  const register = useQuery({ queryKey: registerKeys.detail(current.id, id), queryFn: () => fetchRegister(current.id, id) })
  const ledger = useQuery({ queryKey: registerKeys.ledger(current.id, id), queryFn: () => fetchLedger(id) })
  // Names for "voided by". Best effort: without the list the note simply leaves the name out.
  const membersQ = useQuery({ queryKey: memberKeys.members(current.id), queryFn: () => fetchMembers(current.id), retry: false })
  const members = useMemo(() => (membersQ.data ? new Map(membersQ.data.map((m) => [m.user_id, m.email])) : undefined), [membersQ.data])

  const refresh = () => qc.invalidateQueries({ queryKey: registerKeys.all(current.id) })

  if (register.isPending) return <SectionLoading />
  if (register.isError) return <SectionError error={register.error} onRetry={() => register.refetch()} />
  if (!register.data) return <Navigate to="/registers" replace />
  const r = register.data
  const m = (x: string) => formatMoney(x, current.currency)
  const lines = ledger.data ?? []

  async function toggleArchive() {
    try {
      await updateRegister(current.id, r.id, { is_active: !r.is_active })
      await refresh()
      toast.success(r.is_active ? `${r.name} archived` : `${r.name} restored`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }
  async function onDelete() {
    if (!window.confirm(`Delete the register "${r.name}"? It has no entries.`)) return
    try {
      await deleteRegister(current.id, r.id)
      await qc.invalidateQueries({ queryKey: registerKeys.all(current.id) })
      toast.success('Register deleted')
      navigate('/registers')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <>
      <Link to="/registers" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeftIcon className="size-4" aria-hidden /> Registers
      </Link>
      {/* On paper: only the register, under this header (the page header and buttons are print:hidden). */}
      <div className="mb-4 hidden print:block">
        <div className="text-sm">{current.name}</div>
        <h1 className="text-xl font-semibold">{r.name}</h1>
        <div className="text-sm">Register, not part of the books · All entries · Printed {formatDateTime(new Date())}</div>
      </div>
      <div className="print:hidden">
        <PageHeader
          title={r.name}
          description={
            <>
              Not part of your books{r.is_active ? '' : ' · Archived'}
            </>
          }
          actions={
            <>
              {canWrite && r.is_active && (
                <Button onClick={() => setAdding(true)}>
                  <PlusIcon /> Add entry
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <PrinterIcon /> Print
              </Button>
              <Button
                variant="outline"
                disabled={!ledger.data}
                onClick={() => {
                  const csv = registerCsv(r, lines)
                  downloadCsv(`${slug(current.name)}-${slug(r.name)}.csv`, toCsv(csv.headers, csv.rows))
                }}
              >
                <DownloadIcon /> CSV
              </Button>
              {canWrite && (
                <>
                  <Button variant="outline" size="icon" aria-label="Edit register" onClick={() => setEditing(true)}>
                    <PencilIcon />
                  </Button>
                  <Button variant="outline" size="icon" aria-label={r.is_active ? 'Archive register' : 'Restore register'} onClick={toggleArchive}>
                    {r.is_active ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                  </Button>
                  {ledger.data && lines.length === 0 && (
                    <Button variant="outline" size="icon" aria-label="Delete register" onClick={onDelete}>
                      <Trash2Icon />
                    </Button>
                  )}
                </>
              )}
            </>
          }
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure label="Money in" value={m(r.total_in)} testid="register-in" />
        <Figure label="Money out" value={m(r.total_out)} testid="register-out" />
        <Figure label="Balance now" value={m(r.balance)} testid="register-balance" negative={isNegative(r.balance)} />
      </div>

      {ledger.isPending ? (
        <SectionLoading />
      ) : ledger.isError ? (
        <SectionError error={ledger.error} onRetry={() => ledger.refetch()} />
      ) : (
        <Ledger
          register={r}
          lines={lines}
          currency={current.currency}
          canEdit={canWrite && r.is_active}
          members={members}
          onCorrect={setCorrecting}
          onVoid={setVoiding}
        />
      )}

      <RegisterFormDialog
        open={editing}
        onOpenChange={setEditing}
        register={r}
        onSave={async (input) => {
          await updateRegister(current.id, r.id, input)
          await refresh()
          toast.success('Saved')
        }}
      />
      <EntryFormDialog
        open={adding}
        onOpenChange={setAdding}
        onSave={async (input) => {
          await addEntry(r.id, input)
          await refresh()
          toast.success('Entry added')
        }}
      />
      <EntryFormDialog
        open={correcting !== null}
        onOpenChange={(o) => !o && setCorrecting(null)}
        line={correcting ?? lastCorrecting.current ?? undefined}
        onSave={async (input) => {
          await correctEntry(correcting!.id, input)
          await refresh()
          toast.success('Entry corrected')
        }}
      />
      <VoidEntryDialog
        open={voiding !== null}
        onOpenChange={(o) => !o && setVoiding(null)}
        line={voiding ?? lastVoiding.current}
        onVoid={async (input) => {
          await voidEntry(voiding!.id, input.reason)
          await refresh()
          toast.success('Entry voided')
        }}
      />
    </>
  )
}
