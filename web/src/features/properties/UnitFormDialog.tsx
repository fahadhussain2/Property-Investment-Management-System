import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import type { UnitRow } from './units'
import { unitSchema, type UnitInput } from './schema'

/** Add or rename a unit. Works inside another form (the lease dialog): FormDialog stops the submit there. */
export function UnitFormDialog({
  open,
  onOpenChange,
  unit,
  propertyCode,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit?: UnitRow
  propertyCode?: string
  onSave: (input: UnitInput) => Promise<void>
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={unit ? `Edit ${unit.name}` : propertyCode ? `New unit of ${propertyCode}` : 'New unit'}
      description={unit ? undefined : 'A part of the property rented on its own: a floor, a flat, a shop or a portion.'}
      submitLabel={unit ? 'Save unit' : 'Add unit'}
      schema={unitSchema}
      onSubmit={onSave}
    >
      {(errors) => (
        <>
          <Field
            label="Name"
            name="name"
            autoComplete="off"
            placeholder="Ground floor, Flat 2, Shop 3…"
            defaultValue={unit?.name ?? ''}
            error={errors.name}
          />
          <Field
            label="Notes (optional)"
            name="notes"
            autoComplete="off"
            defaultValue={unit?.notes ?? ''}
            error={errors.notes}
          />
        </>
      )}
    </FormDialog>
  )
}
