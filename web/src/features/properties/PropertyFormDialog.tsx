import { Field, NativeSelect } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { AREA_UNITS, PROPERTY_KINDS } from '@/lib/labels'
import type { Property } from './api'
import { propertySchema, type PropertyInput } from './schema'

export function PropertyFormDialog({
  open,
  onOpenChange,
  property,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing. */
  property?: Property
  onSave: (input: PropertyInput) => Promise<void>
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={property ? `Edit ${property.code}` : 'Add a property'}
      description={property ? undefined : 'Record the property first. Its purchase is entered as an entry later.'}
      submitLabel={property ? 'Save changes' : 'Add property'}
      schema={propertySchema}
      onSubmit={onSave}
    >
      {(errors) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" name="code" defaultValue={property?.code} placeholder="DP-25" error={errors.code} />
            <Field label="Type" name="kind" error={errors.kind}>
              <NativeSelect id="field-kind" name="kind" defaultValue={property?.kind ?? 'house'}>
                {PROPERTY_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field
            label="Name (optional)"
            name="name"
            defaultValue={property?.name ?? ''}
            placeholder="e.g. Defence Phase 5 house"
            error={errors.name}
          />
          <Field label="Address (optional)" name="address" defaultValue={property?.address ?? ''} error={errors.address} />
          <Field label="City (optional)" name="city" defaultValue={property?.city ?? ''} error={errors.city} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Area (optional)"
              name="area"
              inputMode="decimal"
              defaultValue={property?.area ?? ''}
              error={errors.area}
            />
            <Field label="Unit" name="area_unit" error={errors.area_unit}>
              <NativeSelect id="field-area_unit" name="area_unit" defaultValue={property?.area_unit ?? 'marla'}>
                {AREA_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Notes (optional)" name="notes" error={errors.notes}>
            <textarea
              id="field-notes"
              name="notes"
              rows={3}
              defaultValue={property?.notes ?? ''}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </Field>
        </>
      )}
    </FormDialog>
  )
}
