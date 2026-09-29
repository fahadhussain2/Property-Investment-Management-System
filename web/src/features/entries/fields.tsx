import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/Field'
import { accountKeys, fetchAccounts } from '@/features/accounts/api'
import { fetchRentRoll, leaseKeys } from '@/features/leases/api'
import { rentPosition } from '@/features/leases/rentRoll'
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

/**
 * While an option list loads (or if loading fails), the stored value is not among the options, and a
 * <select> whose value has no matching <option> reports '' to FormData: the saved choice silently drops and
 * the form is rejected ('Choose a cash or bank account' with the account visibly chosen). So keep the stored
 * value selectable until its option arrives, like LeasePicker does for a lease.
 */
function KeepSelected({ value, ids, pending, label }: { value: string; ids: string[]; pending: boolean; label: string }) {
  if (!value || ids.includes(value)) return null
  return <option value={value}>{pending ? 'Loading…' : label}</option>
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
  const { data = [], isPending } = useQuery({ queryKey: propertyKeys.all(current.id), queryFn: () => fetchPropertySummaries(current.id) })
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
        <KeepSelected value={value} ids={options.map((p) => p.property_id)} pending={isPending} label="Selected property" />
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
  const { data = [], isPending } = useQuery({ queryKey: partyKeys.all(current.id), queryFn: () => fetchParties(current.id) })
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
        <KeepSelected value={value} ids={data.map((p) => p.id)} pending={isPending} label="Selected party" />
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
  const { data = [], isPending } = useAccounts()
  const options = data.filter((a) => (a.subtype === 'cash' || a.subtype === 'bank') && (a.is_active || a.id === value))
  return (
    <Shell name={name} label={label} error={error} hint={hint}>
      <NativeSelect {...aria(name, error, hint)} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Choose cash or bank…</option>
        <KeepSelected value={value} ids={options.map((a) => a.id)} pending={isPending} label="Selected account" />
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({formatMoney(a.balance, current.currency)})
          </option>
        ))}
      </NativeSelect>
    </Shell>
  )
}

/** Expense or income heads a user may post to (never sales, rent, cost of sales or asset gains: those have their own entries). */
export function CategoryPicker({ name, label, error, defaultValue, categoryType }: Base & { categoryType: 'expense' | 'income' }) {
  const [value, setValue] = useState(defaultValue ?? '')
  const { data = [], isPending } = useAccounts()
  const options = data.filter(
    (a) =>
      a.type === categoryType &&
      !['cogs', 'sales', 'rent', 'asset_gain'].includes(a.subtype) &&
      (a.is_active || a.id === value),
  )
  return (
    <Shell name={name} label={label} error={error} hint="Add your own heads in Settings → Chart of accounts">
      <NativeSelect {...aria(name, error)} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">Choose…</option>
        <KeepSelected value={value} ids={options.map((a) => a.id)} pending={isPending} label="Selected head" />
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

type Picked = { label: string; error?: string; defaultValue?: string; unsoldOnly?: boolean; roles?: PartyRole[]; allowCreate?: boolean }

/**
 * Rent/deposit: pick the lease (which fixes the property and tenant), or "No lease" to pick them by hand.
 * With a lease, hidden property_id/party_id inputs carry its property and tenant so the summary can name
 * them; post_voucher takes them from the lease anyway.
 */
export function LeasePicker({ name, label, error, defaultValue, property, party }: Base & { property: Picked; party: Picked }) {
  const { current } = useOrg()
  const [value, setValue] = useState(defaultValue ?? '')
  const roll = useQuery({ queryKey: leaseKeys.roll(current.id), queryFn: () => fetchRentRoll(current.id) })
  const rows = roll.data ?? []
  const chosen = rows.find((r) => r.lease_id === value)
  const active = rows.filter((r) => r.status === 'active')
  const others = rows.filter((r) => r.status !== 'active')
  const option = (r: (typeof rows)[number]) => (
    <option key={r.lease_id} value={r.lease_id}>
      {r.property_code} · {r.tenant_name}
      {r.status === 'active' ? '' : r.status === 'ended' ? ' (ended)' : ' (upcoming)'}
    </option>
  )
  const hint = chosen
    ? `${formatMoney(chosen.monthly_rent, current.currency)}/month · ${rentPosition(chosen, current.currency).label}`
    : roll.isError
      ? 'Could not load leases. You can still choose the property and tenant.'
      : undefined
  return (
    <>
      <Shell name={name} label={label} error={error} hint={hint}>
        <NativeSelect {...aria(name, error, hint)} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">No lease: choose property &amp; tenant</option>
          {/* Never let a stored lease silently drop while the list loads (or fails): keep it selectable. */}
          {value && !chosen && <option value={value}>{roll.isPending ? 'Loading…' : 'Selected lease'}</option>}
          {active.length > 0 && <optgroup label="Current leases">{active.map(option)}</optgroup>}
          {others.length > 0 && <optgroup label="Other leases">{others.map(option)}</optgroup>}
        </NativeSelect>
      </Shell>
      {value ? (
        chosen && (
          <>
            <input type="hidden" name="property_id" value={chosen.property_id} />
            <input type="hidden" name="party_id" value={chosen.party_id} />
          </>
        )
      ) : (
        <>
          <PropertyPicker name="property_id" {...property} />
          <PartyPicker name="party_id" {...party} />
        </>
      )}
    </>
  )
}

export { Shell as FieldShell }
