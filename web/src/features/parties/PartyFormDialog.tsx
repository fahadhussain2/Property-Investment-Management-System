import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { PARTY_ROLES } from '@/lib/labels'
import type { Party } from './api'
import { partySchema, type PartyInput } from './schema'

export function PartyFormDialog({
  open,
  onOpenChange,
  party,
  defaultRoles,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  party?: Party
  /** Roles pre-ticked for a new party (e.g. 'seller' when created from a purchase). */
  defaultRoles?: string[]
  onSave: (input: PartyInput) => Promise<void>
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={party ? `Edit ${party.name}` : 'Add a party'}
      description={party ? undefined : 'A person or company you buy from, sell to, rent to or work with.'}
      submitLabel={party ? 'Save changes' : 'Add party'}
      schema={partySchema}
      onSubmit={onSave}
    >
      {(errors) => (
        <>
          <Field label="Name" name="name" defaultValue={party?.name} autoComplete="off" error={errors.name} />
          <fieldset className="grid grid-cols-1 gap-1.5">
            <legend className="text-sm font-medium">Roles</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2" aria-describedby={errors.roles ? 'roles-error' : undefined}>
              {PARTY_ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="roles"
                    value={r.value}
                    defaultChecked={(party?.roles ?? defaultRoles ?? []).includes(r.value)}
                    className="size-4 accent-primary"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {errors.roles && (
              <p id="roles-error" className="text-sm text-destructive">
                {errors.roles}
              </p>
            )}
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Phone (optional)" name="phone" type="tel" defaultValue={party?.phone ?? ''} error={errors.phone} />
            <Field label="CNIC (optional)" name="cnic" inputMode="numeric" defaultValue={party?.cnic ?? ''} placeholder="35202-1234567-1" error={errors.cnic} />
          </div>
          <Field label="Email (optional)" name="email" type="email" defaultValue={party?.email ?? ''} error={errors.email} />
          <Field label="Address (optional)" name="address" defaultValue={party?.address ?? ''} error={errors.address} />
          <Field label="Notes (optional)" name="notes" defaultValue={party?.notes ?? ''} error={errors.notes} />
        </>
      )}
    </FormDialog>
  )
}
