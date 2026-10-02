import { useQuery } from '@tanstack/react-query'
import { DoorClosedIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { friendlyError } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { createUnit, deleteUnit, fetchUnits, propertyKeys, updateUnit } from './api'
import { UnitFormDialog } from './UnitFormDialog'
import { useRefreshAfterUnitChange } from './useRefreshAfterUnitChange'
import { canDeleteUnit, occupancyLabel, unitStateLabel, type UnitRow } from './units'

/** The units of a property and who has each one today (spec 006 §7). */
export function UnitsSection({ propertyId, propertyCode, sold }: { propertyId: string; propertyCode: string; sold: boolean }) {
  const { current, canWrite } = useOrg()
  const refresh = useRefreshAfterUnitChange()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<UnitRow | null>(null)
  const units = useQuery({
    queryKey: propertyKeys.units(current.id, propertyId),
    queryFn: () => fetchUnits(current.id, propertyId),
  })
  const write = canWrite && !sold

  if (sold && units.data?.length === 0) return null

  async function onDelete(u: UnitRow) {
    if (!canDeleteUnit(u)) {
      toast.error(`${u.name} has leases, so it can’t be deleted. You can rename it.`)
      return
    }
    if (!confirm(`Delete ${u.name}?`)) return
    try {
      await deleteUnit(current.id, u.id)
      await refresh()
      toast.success(`${u.name} deleted`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const rows = units.data ?? []
  const vacant = rows.filter((u) => u.state === 'vacant').length
  const occupancy = occupancyLabel(rows.length, vacant)

  return (
    <section data-testid="units-section">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Units
          {occupancy && (
            <span className="ml-2 font-normal" data-testid="occupancy">
              {occupancy}
            </span>
          )}
        </h2>
        {write && (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setAdding(true)}>
            <PlusIcon /> Add unit
          </Button>
        )}
      </div>
      {units.isPending ? (
        <SectionLoading label="Loading units…" />
      ) : units.isError ? (
        <SectionError error={units.error} onRetry={() => units.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={DoorClosedIcon} title="No units">
          This property is rented as a whole.{write && ' Add units if parts of it are rented separately.'}
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border text-sm" data-testid="unit-list">
          {rows.map((u) => (
            <li key={u.id} className="flex items-start gap-2 px-4 py-2" data-testid={`unit-${u.name}`}>
              <div className="min-w-0 flex-1">
                <div className="font-medium break-words">{u.name}</div>
                <div className={cn('break-words', u.state === 'vacant' ? 'text-muted-foreground' : '')}>
                  {u.lease_id ? (
                    <Link to={`/leases/${u.lease_id}`} className="underline">
                      <StateText unit={u} />
                    </Link>
                  ) : (
                    <StateText unit={u} />
                  )}
                </div>
                {u.notes && <div className="break-words text-muted-foreground">{u.notes}</div>}
              </div>
              {write && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${u.name}`} onClick={() => setEditing(u)}>
                    <PencilIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${u.name}`} onClick={() => onDelete(u)}>
                    <Trash2Icon />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <UnitFormDialog
        open={adding}
        onOpenChange={setAdding}
        propertyCode={propertyCode}
        onSave={async (input) => {
          const created = await createUnit(current.id, propertyId, input)
          await refresh()
          toast.success(`${created.name} added`)
        }}
      />
      <UnitFormDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        unit={editing ?? undefined}
        onSave={async (input) => {
          await updateUnit(current.id, editing!.id, input)
          await refresh()
          toast.success('Unit updated')
        }}
      />
    </section>
  )
}

/** The unit's state; a date never breaks at its hyphens. */
function StateText({ unit }: { unit: UnitRow }) {
  const label = unitStateLabel(unit)
  const date = unit.state === 'rented' ? unit.lease_ends : null
  if (!date || !label.endsWith(date)) return label
  return (
    <>
      {label.slice(0, -date.length)}
      <span className="whitespace-nowrap">{date}</span>
    </>
  )
}
