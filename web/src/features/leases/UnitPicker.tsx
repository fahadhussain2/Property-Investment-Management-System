import { useQuery } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/Field'
import { FieldShell } from '@/features/entries/fields'
import { useOrg } from '@/features/org/OrgProvider'
import { createUnit, fetchUnits, propertyKeys } from '@/features/properties/api'
import { UnitFormDialog } from '@/features/properties/UnitFormDialog'
import { useRefreshAfterUnitChange } from '@/features/properties/useRefreshAfterUnitChange'
import { WHOLE_PROPERTY, type UnitState } from './schema'

const STATE_NOTE = { rented: ' (rented)', whole_property: ' (whole property let)', vacant: ' (vacant)' }

/**
 * The lease's unit (spec 006 §4/§7). Shown once a property is chosen. A property with units needs an explicit
 * choice ("Whole property" or a unit), never a silent default. A property without units is let as a whole, and
 * "New unit" adds its first unit. Remount (key) on a property change to clear the choice.
 */
export function UnitPicker({
  propertyId,
  defaultValue,
  error,
}: {
  propertyId: string
  defaultValue?: string
  error?: string
}) {
  const { current, canWrite } = useOrg()
  const refresh = useRefreshAfterUnitChange()
  const [value, setValue] = useState(defaultValue ?? '')
  const [creating, setCreating] = useState(false)
  const units = useQuery({
    queryKey: propertyKeys.units(current.id, propertyId),
    queryFn: () => fetchUnits(current.id, propertyId),
  })
  const rows = units.data ?? []
  const state: UnitState = units.isPending ? 'loading' : units.isError ? 'error' : rows.length ? 'some' : 'none'
  const hint =
    state === 'none'
      ? 'Whole property: it has no units. Add a unit if only part of it is rented.'
      : state === 'some' && value === WHOLE_PROPERTY
        ? 'The whole property: no unit can be rented to anyone else for these dates.'
        : undefined

  return (
    <>
      <FieldShell
        name="unit_id"
        label="Unit"
        error={error}
        hint={hint}
        action={
          canWrite && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setCreating(true)}>
              <PlusIcon /> New unit
            </Button>
          )
        }
      >
        <input type="hidden" name="unit_state" value={state} />
        {state === 'some' ? (
          <NativeSelect
            id="field-unit_id"
            name="unit_id"
            aria-invalid={!!error}
            aria-describedby={error ? 'field-unit_id-error' : hint ? 'field-unit_id-hint' : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Choose a unit…</option>
            <option value={WHOLE_PROPERTY}>Whole property</option>
            {rows.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {STATE_NOTE[u.state]}
              </option>
            ))}
          </NativeSelect>
        ) : state === 'loading' ? (
          <NativeSelect id="field-unit_id" disabled value="">
            <option value="">Loading units…</option>
          </NativeSelect>
        ) : state === 'error' ? (
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => units.refetch()}>
            Could not load the units. Try again
          </Button>
        ) : null}
      </FieldShell>
      <UnitFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSave={async (input) => {
          const created = await createUnit(current.id, propertyId, input)
          await refresh()
          setValue(created.id)
          toast.success(`${created.name} added`)
        }}
      />
    </>
  )
}
