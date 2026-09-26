import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { AmountField, PartyPicker, PropertyPicker } from '@/features/entries/fields'
import { isZero, today, toMoney } from '@/lib/money'
import type { Lease } from './api'
import { leaseSchema, type LeaseInput } from './schema'

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
      onSubmit={onSave}
    >
      {(errors) => (
        <>
          <PropertyPicker
            name="property_id"
            label="Property"
            unsoldOnly
            defaultValue={lease?.property_id ?? propertyId}
            error={errors.property_id}
          />
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
