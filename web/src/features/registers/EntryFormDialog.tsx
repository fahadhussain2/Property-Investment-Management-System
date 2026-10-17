import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { useOrg } from '@/features/org/OrgProvider'
import { today } from '@/lib/money'
import type { LedgerLine } from './model'
import { entrySchema, voidSchema, type EntryInput, type VoidInput } from './schema'

const choice =
  'flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm has-[:checked]:border-foreground has-[:checked]:bg-accent'

/** Add a line to a register, or (with `line`) correct one: the old line stays, crossed out, and this replaces it. */
export function EntryFormDialog({
  open,
  onOpenChange,
  line,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  line?: LedgerLine
  onSave: (input: EntryInput) => Promise<void>
}) {
  const { current } = useOrg()
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={line ? 'Correct entry' : 'Add an entry'}
      description={
        line
          ? 'The original stays in the register, crossed out, and this line replaces it.'
          : 'Not part of your books: this only changes this register.'
      }
      submitLabel={line ? 'Save correction' : 'Add entry'}
      schema={entrySchema}
      onSubmit={onSave}
    >
      {(errors) => (
        <>
          <Field label="Date" name="entry_date" type="date" defaultValue={line?.date ?? today()} max={today()} error={errors.entry_date} />
          <Field label="Description" name="description" defaultValue={line?.description} placeholder="Who or what for" error={errors.description} />
          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-medium">Money</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className={choice}>
                <input type="radio" name="direction" value="in" defaultChecked={(line?.direction ?? 'in') === 'in'} /> Money in
              </label>
              <label className={choice}>
                <input type="radio" name="direction" value="out" defaultChecked={line?.direction === 'out'} /> Money out
              </label>
            </div>
            {errors.direction && <p className="text-sm text-destructive">{errors.direction}</p>}
          </fieldset>
          <Field label={`Amount (${current.currency})`} name="amount" inputMode="decimal" defaultValue={line?.amount} placeholder="25,000" error={errors.amount} />
          {line && <Field label="Reason (optional)" name="reason" placeholder="Why it is corrected" error={errors.reason} />}
        </>
      )}
    </FormDialog>
  )
}

/** Void a line: it stays in the register, crossed out, and no longer counts. */
export function VoidEntryDialog({
  open,
  onOpenChange,
  line,
  onVoid,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  line: LedgerLine | null
  onVoid: (input: VoidInput) => Promise<void>
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Void entry"
      description={line ? `“${line.description}” stays in the register, crossed out, and no longer counts.` : undefined}
      submitLabel="Void entry"
      schema={voidSchema}
      onSubmit={onVoid}
    >
      {(errors) => <Field label="Reason (optional)" name="reason" error={errors.reason} />}
    </FormDialog>
  )
}
