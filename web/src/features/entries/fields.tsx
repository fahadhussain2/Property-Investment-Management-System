import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/Field'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { useOrg } from '@/features/org/OrgProvider'
import { createParty, fetchParties, partyKeys } from '@/features/parties/api'
import { PartyFormDialog } from '@/features/parties/PartyFormDialog'
import { createProperty, fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { PropertyFormDialog } from '@/features/properties/PropertyFormDialog'
import type { PartyRole } from '@/lib/labels'
import { formatMoney, inLakhCrore, parseMoney } from '@/lib/money'

type Base = { name: string; label: string; error?: string; hint?: string; defaultValue?: string }

/** Label + control + error/hint, sharing the id convention of <Field>. */
function Shell({ name, label, error, hint, action, children }: Base & { action?: React.ReactNode; children: React.ReactNode }) {
  const id = `field-${name}`
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const aria = (name: string, error?: string, hint?: string) => ({
  id: `field-${name}`,
  name,
  'aria-invalid': !!error,
  'aria-describedby': error ? `field-${name}-error` : hint ? `field-${name}-hint` : undefined,
})

/** Amount input with a live "Rs 12,500,000 · 1.25 crore" read-back, so big numbers are never misread. */
export function AmountField({ name, label, error, hint, defaultValue }: Base) {
  const { current } = useOrg()
  const [value, setValue] = useState(defaultValue ?? '')
  let readBack: string | undefined
  try {
    if (value.trim()) {
      const m = parseMoney(value)
      const words = inLakhCrore(m)
      readBack = `${formatMoney(m, current.currency)}${words ? ` · ${words}` : ''}`
    }
  } catch {
    readBack = undefined
  }
  return (
    <Shell name={name} label={label} error={error} hint={readBack ?? hint}>
      <Input
        {...aria(name, error, readBack ?? hint)}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </Shell>
  )
}

export function PropertyPicker({
  name,
  label,
  error,
  defaultValue,
  unsoldOnly,
  optional,
  allowCreate,
}: Base & { unsoldOnly?: boolean; optional?: boolean; allowCreate?: boolean }) {
  const { current } = useOrg()
  const qc = useQueryClient()
  const [value, setValue] = useState(defaultValue ?? '')
  const [creating, setCreating] = useState(false)
  const { data = [] } = useQuery({ queryKey: propertyKeys.all(current.id), queryFn: () => fetchPropertySummaries(current.id) })
  // Keep the current selection visible when editing an old entry, even if it no longer qualifies.
  const options = data.filter((p) => !unsoldOnly || p.status !== 'sold' || p.property_id === value)
  return (
    <Shell
      name={name}
      label={label}
      error={error}
      action={
        allowCreate && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setCreating(true)}>
            <PlusIcon /> New property
          </Button>
        )
      }
    >
      <NativeSelect {...aria(name, error)} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">{optional ? 'None' : 'Choose a property…'}</option>
        {options.map((p) => (
          <option key={p.property_id} value={p.property_id}>
            {p.code}
            {p.name ? ` · ${p.name}` : ''}
          </option>
        ))}
      </NativeSelect>
      {allowCreate && (
        <PropertyFormDialog
          open={creating}
          onOpenChange={setCreating}
          onSave={async (input) => {
            const created = await createProperty(current.id, input)
            await qc.invalidateQueries({ queryKey: propertyKeys.all(current.id) })
            setValue(created.id)
            toast.success(`${created.code} added`)
          }}
        />
      )}
    </Shell>
  )
}

export function PartyPicker({
  name,
  label,
  error,
  defaultValue,
  roles = [],
  allowCreate,
}: Base & { roles?: PartyRole[]; allowCreate?: boolean }) {
  const { current } = useOrg()
  const qc = useQueryClient()
  const [value, setValue] = useState(defaultValue ?? '')
  const [creating, setCreating] = useState(false)
  const { data = [] } = useQuery({ queryKey: partyKeys.all(current.id), queryFn: () => fetchParties(current.id) })
  const matching = data.filter((p) => roles.some((r) => p.roles.includes(r)))
  const others = data.filter((p) => !matching.includes(p))
  return (
    <Shell
      name={name}
      label={label}
      error={error}
      action={
        allowCreate && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setCreating(true)}>
            <PlusIcon /> New {label.toLowerCase()}
          </Button>
        )
      }
    >
      <NativeSelect {...aria(name, error)} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Choose…</option>
        {matching.length > 0 && (
          <optgroup label={`${label}s`}>
            {matching.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label={matching.length ? 'Others' : 'Parties'}>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </NativeSelect>
      {allowCreate && (
        <PartyFormDialog
          open={creating}
          onOpenChange={setCreating}
          defaultRoles={roles}
          onSave={async (input) => {
            const created = await createParty(current.id, input)
            await qc.invalidateQueries({ queryKey: partyKeys.all(current.id) })
            setValue(created.id)
            toast.success(`${created.name} added`)
          }}
        />
      )}
    </Shell>
  )
}

function useAccounts() {
  const { current } = useOrg()
  return useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
}

/** Active cash and bank accounts, with their balance so users see where money is. */
export function MoneyAccountPicker({ name, label, error, hint, defaultValue }: Base) {
  const { current } = useOrg()
  const [value, setValue] = useState(defaultValue ?? '')
  const { data = [] } = useAccounts()
  const options = data.filter((a) => (a.subtype === 'cash' || a.subtype === 'bank') && (a.is_active || a.id === value))
  return (
    <Shell name={name} label={label} error={error} hint={hint}>
      <NativeSelect {...aria(name, error, hint)} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Choose cash or bank…</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({formatMoney(a.balance, current.currency)})
          </option>
        ))}
      </NativeSelect>
    </Shell>
  )
}

/** Expense or income heads a user may post to (never sales, rent or cost of sales: those have their own entries). */
export function CategoryPicker({ name, label, error, defaultValue, categoryType }: Base & { categoryType: 'expense' | 'income' }) {
  const [value, setValue] = useState(defaultValue ?? '')
  const { data = [] } = useAccounts()
  const options = data.filter(
    (a) =>
      a.type === categoryType &&
      !['cogs', 'sales', 'rent'].includes(a.subtype) &&
      (a.is_active || a.id === value),
  )
  return (
    <Shell name={name} label={label} error={error} hint="Add your own heads in Settings → Chart of accounts">
      <NativeSelect {...aria(name, error)} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>
    </Shell>
  )
}

export function DirectionField({ name, label, defaultValue }: Base) {
  return (
    <fieldset className="grid grid-cols-1 gap-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex gap-4 text-sm">
        {[
          ['received', 'Received from tenant'],
          ['refunded', 'Refunded to tenant'],
        ].map(([v, l]) => (
          <label key={v} className="flex items-center gap-2">
            <input type="radio" name={name} value={v} defaultChecked={(defaultValue ?? 'received') === v} className="accent-primary" />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export { Shell as FieldShell }
