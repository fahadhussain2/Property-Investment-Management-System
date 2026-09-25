import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, SearchIcon, UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { PARTY_ROLES, roleLabel, type PartyRole } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { createParty, fetchParties, partyKeys } from './api'
import { PartyFormDialog } from './PartyFormDialog'

export function PartiesPage() {
  const { current, canWrite } = useOrg()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [role, setRole] = useState<PartyRole | 'all'>('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const list = useQuery({ queryKey: partyKeys.all(current.id), queryFn: () => fetchParties(current.id) })
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (list.data ?? []).filter(
      (p) =>
        (role === 'all' || p.roles.includes(role)) &&
        (!needle || p.name.toLowerCase().includes(needle) || (p.phone ?? '').includes(needle)),
    )
  }, [list.data, role, q])

  return (
    <>
      <PageHeader
        title="Parties"
        description="Sellers, buyers, tenants and agents you deal with"
        actions={
          canWrite && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Add party
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by role">
        {[{ value: 'all' as const, label: 'All' }, ...PARTY_ROLES].map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={role === r.value}
            onClick={() => setRole(r.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              role === r.value ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="relative mb-4">
        <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input aria-label="Search parties" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>

      {list.isPending ? (
        <SectionLoading label="Loading parties…" />
      ) : list.isError ? (
        <SectionError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No parties yet">
          {canWrite ? 'Add the people you buy from, sell to and rent to.' : 'Nothing has been added yet.'}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No parties match these filters" />
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="party-list">
          {rows.map((p) => (
            <li key={p.id}>
              <Link to={`/parties/${p.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-accent">
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="flex flex-wrap gap-1">
                  {p.roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {roleLabel(r)}
                    </Badge>
                  ))}
                </span>
                {p.phone && <span className="w-full text-sm text-muted-foreground sm:w-auto">{p.phone}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <PartyFormDialog
        open={adding}
        onOpenChange={setAdding}
        onSave={async (input) => {
          const created = await createParty(current.id, input)
          await queryClient.invalidateQueries({ queryKey: partyKeys.all(current.id) })
          toast.success(`${created.name} added`)
          navigate(`/parties/${created.id}`)
        }}
      />
    </>
  )
}
