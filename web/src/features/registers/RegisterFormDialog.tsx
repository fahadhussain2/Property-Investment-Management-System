import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { useOrg } from '@/features/org/OrgProvider'
import type { RegisterRow } from './model'
import { registerSchema, type RegisterInput } from './schema'

/** Add a register, or (with `register`) rename it and change where it starts. */
export function RegisterFormDialog({
  open,
  onOpenChange,
  register,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  register?: RegisterRow
  onSave: (input: RegisterInput) => Promise<void>
}) {
  const { current } = useOrg()
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={register ? 'Edit register' : 'Add a register'}
      description="A register is a ledger kept outside your books. Nothing in it changes your cash, profit or reports."
      submitLabel={register ? 'Save' : 'Add register'}
      schema={registerSchema}
      onSubmit={onSave}
    >
      {(errors) => (
        <>
          <Field label="Name" name="name" defaultValue={register?.name} placeholder="Zakat Fund" error={errors.name} />
          <Field
            label={`Opening balance (${current.currency})`}
            name="opening_balance"
            inputMode="decimal"
            defaultValue={register ? register.opening_balance : ''}
            placeholder="0"
            hint="What the register already holds when you start it. Leave empty for 0."
            error={errors.opening_balance}
          />
          <Field label="As of (optional)" name="opening_date" type="date" defaultValue={register?.opening_date ?? ''} max="2100-12-31" error={errors.opening_date} />
        </>
      )}
    </FormDialog>
  )
}
