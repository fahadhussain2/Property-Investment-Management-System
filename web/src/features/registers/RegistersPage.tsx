import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookMarkedIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { useOrg } from '@/features/org/OrgProvider'
import { formatDate } from '@/lib/dates'
import { formatMoney, isNegative } from '@/lib/money'
import { cn } from '@/lib/utils'
import { createRegister, fetchRegisters, registerKeys } from './api'
import type { RegisterRow } from './model'
import { RegisterFormDialog } from './RegisterFormDialog'

function RegisterCard({ r, currency }: { r: RegisterRow; currency: string }) {
  const m = (x: string) => formatMoney(x, currency)
  return (
    <li>
      <Link to={`/registers/${r.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-accent/50" data-testid="register-card">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{r.name}</span>
          <span className={cn('block text-lg font-semibold tabular-nums sm:text-xl', isNegative(r.balance) && 'text-red-700 dark:text-red-400')}>
            {m(r.balance)}
          </span>
          <span className="block text-xs text-muted-foreground">
            In {m(r.total_in)} · Out {m(r.total_out)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {r.entry_count} {r.entry_count === 1 ? 'entry' : 'entries'}
            {r.last_entry_date ? ` · last ${formatDate(r.last_entry_date)}` : ''}
          </span>
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  )
}

/** Registers (spec 007): ledgers kept outside the books. Nothing here reaches cash, profit, reports or the dashboard. */
export function RegistersPage() {
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const list = useQuery({ queryKey: registerKeys.list(current.id), queryFn: () => fetchRegisters(current.id) })

  const active = (list.data ?? []).filter((r) => r.is_active)
  const archived = (list.data ?? []).filter((r) => !r.is_active)
  return (
    <>
      <PageHeader
        title="Registers"
        description="Ledgers kept outside your books, for example a Zakat fund. Nothing here changes your cash, profit or reports."
        actions={
          canWrite && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Add register
            </Button>
          )
        }
      />
      {list.isPending ? (
        <SectionLoading />
      ) : list.isError ? (
        <SectionError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={BookMarkedIcon} title="No registers yet">
          A register is a ledger kept outside your books, for example a Zakat fund.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {active.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="register-list">
              {active.map((r) => (
                <RegisterCard key={r.id} r={r} currency={current.currency} />
              ))}
            </ul>
          )}
          {archived.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Archived</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="register-archived">
                {archived.map((r) => (
                  <RegisterCard key={r.id} r={r} currency={current.currency} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <RegisterFormDialog
        open={adding}
        onOpenChange={setAdding}
        onSave={async (input) => {
          const id = await createRegister(current.id, input)
          await qc.invalidateQueries({ queryKey: registerKeys.all(current.id) })
          toast.success(`${input.name} added`)
          navigate(`/registers/${id}`)
        }}
      />
    </>
  )
}
