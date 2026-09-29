import { useState } from 'react'
import { Field, NativeSelect } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { HOLDING_CLASSES, PURITIES, type HoldingClass } from '@/lib/labels'
import type { Holding } from './api'
import { metalSchema, vehicleSchema, type HoldingInput } from './schema'

const textarea =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

/**
 * Add or edit a vehicle / gold item / silver item. When several classes are allowed (the "+ New" button in
 * an entry form), the class is picked first; it never changes afterwards (the database forbids it).
 */
export function HoldingFormDialog({
  open,
  onOpenChange,
  classes,
  holding,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classes: HoldingClass[]
  /** Present when editing. */
  holding?: Holding
  onSave: (cls: HoldingClass, input: HoldingInput) => Promise<void>
}) {
  const [cls, setCls] = useState<HoldingClass>((holding?.class as HoldingClass | undefined) ?? classes[0])
  const vehicle = cls === 'vehicle'
  const one = HOLDING_CLASSES[cls].one
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={holding ? `Edit ${holding.code}` : `Add a ${classes.length === 3 ? 'vehicle, gold or silver item' : classes.length === 2 ? 'gold or silver item' : one}`}
      description={holding ? undefined : 'Record it first. Its purchase is entered as an entry.'}
      submitLabel={holding ? 'Save changes' : `Add ${vehicle ? 'vehicle' : 'item'}`}
      schema={vehicle ? vehicleSchema : metalSchema}
      onSubmit={(input) => onSave(cls, input as HoldingInput)}
    >
      {(errors) => (
        <>
          {!holding && classes.length > 1 && (
            <Field label="What is it?" name="holding_class">
              <NativeSelect id="field-holding_class" value={cls} onChange={(e) => setCls(e.target.value as HoldingClass)}>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c === 'vehicle' ? 'Vehicle' : c === 'gold' ? 'Gold' : 'Silver'}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code" name="code" defaultValue={holding?.code} placeholder={vehicle ? 'CAR-1' : cls === 'gold' ? 'G-01' : 'S-01'} error={errors.code} />
            {vehicle ? (
              <Field label="Year (optional)" name="year" inputMode="numeric" defaultValue={holding?.year ?? ''} error={errors.year} />
            ) : (
              <Field label="Purity" name="purity" error={errors.purity}>
                <NativeSelect id="field-purity" name="purity" defaultValue={holding?.purity != null ? Number(holding.purity).toFixed(4) : PURITIES[cls][cls === 'gold' ? 1 : 0].value}>
                  {PURITIES[cls].map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
          <Field
            label="Name (optional)"
            name="name"
            defaultValue={holding?.name ?? ''}
            placeholder={vehicle ? 'e.g. Family car' : 'e.g. Bridal set, 10 tola bar'}
            error={errors.name}
          />
          {vehicle && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Make (optional)" name="make" defaultValue={holding?.make ?? ''} placeholder="Toyota" error={errors.make} />
                <Field label="Model (optional)" name="model" defaultValue={holding?.model ?? ''} placeholder="Corolla" error={errors.model} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Registration no. (optional)" name="registration_no" defaultValue={holding?.registration_no ?? ''} error={errors.registration_no} />
                <Field label="Colour (optional)" name="colour" defaultValue={holding?.colour ?? ''} error={errors.colour} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Chassis no. (optional)" name="chassis_no" defaultValue={holding?.chassis_no ?? ''} error={errors.chassis_no} />
                <Field label="Engine no. (optional)" name="engine_no" defaultValue={holding?.engine_no ?? ''} error={errors.engine_no} />
              </div>
            </>
          )}
          <Field label="Notes (optional)" name="notes" error={errors.notes}>
            <textarea id="field-notes" name="notes" rows={3} defaultValue={holding?.notes ?? ''} className={textarea} />
          </Field>
        </>
      )}
    </FormDialog>
  )
}
