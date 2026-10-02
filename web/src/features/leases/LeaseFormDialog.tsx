import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { AmountField, PartyPicker, PropertyPicker } from '@/features/entries/fields'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchUnits, propertyKeys } from '@/features/properties/api'
import { isZero, today, toMoney } from '@/lib/money'
import type { Lease } from './api'
import { leaseSchema, UNIT_REQUIRED, WHOLE_PROPERTY, type LeaseForm, type LeaseInput } from './schema'
import { UnitPicker } from './UnitPicker'

/** Add or edit a lease. Creating a lease records no money: rent and deposits are entries. */
export function LeaseFormDialog({
  open,
  onOpenChange,
  lease,
  propertyId,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lease?: Lease
  /** Pre-selects the property (e.g. "Add lease" on a property page). */
  propertyId?: string
  onSave: (input: LeaseInput) => Promise<void>
}) {
  const { current } = useOrg()
  const qc = useQueryClient()

  // Spec 006: if the form saved before it could show the property's units, look them up now (waiting for a
  // fetch already in flight). A property with units needs a choice; an unchanged lease keeps its unit.
  async function save({ unit_chosen, ...input }: LeaseForm) {
    if (!unit_chosen) {
      const units = await qc.fetchQuery({
        queryKey: propertyKeys.units(current.id, input.property_id),
        queryFn: () => fetchUnits(current.id, input.property_id),
      })
      if (units.length > 0) {
        if (lease && lease.property_id === input.property_id) input.unit_id = lease.unit_id
        else throw new Error(UNIT_REQUIRED)
      }
    }
    await onSave(input)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={lease ? 'Edit lease' : 'New lease'}
      description={
        lease
          ? undefined
          : 'Rent and the security deposit are recorded as entries when you receive them.'
      }
      submitLabel={lease ? 'Save lease' : 'Add lease'}
      schema={leaseSchema}
      onSubmit={save}
    >
      {(errors) => (
        <>
          <PropertyAndUnit lease={lease} propertyId={propertyId} errors={errors} />
          <PartyPicker
            name="party_id"
            label="Tenant"
            roles={['tenant']}
            allowCreate
            defaultValue={lease?.party_id}
            error={errors.party_id}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Start date"
              name="start_date"
              type="date"
              max="2100-12-31"
              defaultValue={lease?.start_date ?? today()}
              error={errors.start_date}
            />
            <Field
              label="End date (optional)"
              name="end_date"
              type="date"
              max="2100-12-31"
              defaultValue={lease?.end_date ?? ''}
              error={errors.end_date}
              hint="Leave empty if it has no fixed end"
            />
          </div>
          <AmountField
            name="monthly_rent"
            label="Rent per month"
            defaultValue={lease ? toMoney(lease.monthly_rent) : undefined}
            error={errors.monthly_rent}
          />
          <AmountField
            name="security_deposit"
            label="Security deposit (optional)"
            defaultValue={
              lease && !isZero(toMoney(lease.security_deposit)) ? toMoney(lease.security_deposit) : undefined
            }
            error={errors.security_deposit}
          />
          <Field
            label="Rent due on day (optional)"
            name="rent_due_day"
            inputMode="numeric"
            placeholder="Same day as the start"
            defaultValue={lease ? String(lease.rent_due_day) : ''}
            error={errors.rent_due_day}
            hint="Day of the month rent is due, 1 to 28. Used to count months unpaid."
          />
          <Field
            label="Count rent from (optional)"
            name="rent_counted_from"
            type="date"
            max="2100-12-31"
            defaultValue={lease?.rent_counted_from ?? ''}
            error={errors.rent_counted_from}
            hint="For a lease that began before you started using this system: the first month whose rent is tracked here (usually your cut-over date). Pick an earlier month to carry rent still owed at cut-over."
          />
          <Field
            label="Notes (optional)"
            name="notes"
            autoComplete="off"
            defaultValue={lease?.notes ?? ''}
            error={errors.notes}
          />
        </>
      )}
    </FormDialog>
  )
}

/** The property, then its unit (spec 006). Choosing another property clears the unit. */
function PropertyAndUnit({
  lease,
  propertyId,
  errors,
}: {
  lease?: Lease
  propertyId?: string
  errors: Partial<Record<string, string>>
}) {
  const initial = lease?.property_id ?? propertyId ?? ''
  const [property, setProperty] = useState(initial)
  // An existing lease keeps its unit, or "Whole property", while its property stays the same.
  const unitDefault = lease && property === lease.property_id ? (lease.unit_id ?? WHOLE_PROPERTY) : undefined
  return (
    <>
      <PropertyPicker
        name="property_id"
        label="Property"
        unsoldOnly
        defaultValue={initial}
        error={errors.property_id}
        onValueChange={setProperty}
      />
      {property && <UnitPicker key={property} propertyId={property} defaultValue={unitDefault} error={errors.unit_id} />}
    </>
  )
}
