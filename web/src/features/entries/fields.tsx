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
import { createHolding, fetchHoldings, holdingKeys } from '@/features/holdings/api'
import { HoldingFormDialog } from '@/features/holdings/HoldingFormDialog'
import { createProperty, fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { PropertyFormDialog } from '@/features/properties/PropertyFormDialog'
import { HOLDING_CLASSES, purityLabel, type HoldingClass, type PartyRole } from '@/lib/labels'
import { formatMoney, inLakhCrore, parseMoney } from '@/lib/money'
import { formatWeight, isWeightUnit, parseWeight, toGrams, unitToGrams, WEIGHT_UNITS } from '@/lib/quantity'
import type { HoldingFilter } from './types'

type Base = { name: string; label: string; error?: string; hint?: string; defaultValue?: string }

/** Label + control + error/hint, sharing the id convention of <Field>. */
function Shell({ name, label, error, hint, action, children }: Base & { action?: React.ReactNode; children: React.ReactNode }) {
  const id = `field-${name}`
  return (
    // content-start: keeps the label and control at the top when a neighbouring field's message makes the row taller.
    <div className="grid grid-cols-1 content-start gap-1.5">
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
    <fieldset className="grid grid-cols-1 content-start gap-1.5">
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

const CLASSES_FOR: Record<HoldingFilter, HoldingClass[]> = {
  vehicle: ['vehicle'],
  metal: ['gold', 'silver'],
  any: ['vehicle', 'gold', 'silver'],
}

/** Input names of the weight controls; opening balances prefix them per row. */
export type WeightNames = { cls: string; weight: string; unit: string; whole: string }
const WEIGHT_NAMES: WeightNames = { cls: 'holding_class', weight: 'weight', unit: 'unit', whole: 'whole' }

/**
 * A vehicle, gold or silver item. For gold/silver it can also ask for the weight: bought, or sold (a weight,
 * or "the whole item"). A hidden input carries the chosen item's class so the form knows whether a weight is
 * needed. The weight is sent as typed with its unit; the database converts it to grams exactly.
 */
export function HoldingPicker({
  name,
  label,
  error,
  defaultValue,
  holdingClass = 'any',
  unsoldOnly,
  optional,
  allowCreate,
  weight,
  weightValues = {},
  weightError,
  weightLabel,
  names = WEIGHT_NAMES,
}: Base & {
  holdingClass?: HoldingFilter
  unsoldOnly?: boolean
  optional?: boolean
  allowCreate?: boolean
  weight?: 'buy' | 'sell'
  weightValues?: { weight?: string; unit?: string; whole?: string }
  weightError?: string
  weightLabel?: string
  names?: WeightNames
}) {
  const { current } = useOrg()
  const qc = useQueryClient()
  const [value, setValue] = useState(defaultValue ?? '')
  const [creating, setCreating] = useState(false)
  const [whole, setWhole] = useState(weightValues.whole === 'true')
  const { data = [], isPending } = useQuery({ queryKey: holdingKeys.all(current.id), queryFn: () => fetchHoldings(current.id) })
  const classes = CLASSES_FOR[holdingClass]
  const options = data.filter((h) => classes.includes(h.class) && (!unsoldOnly || h.status !== 'sold' || h.id === value))
  const selected = data.find((h) => h.id === value)
  const metal = selected && selected.class !== 'vehicle'
  const held = selected ? formatWeight(toGrams(selected.weight_g), 'tola') : ''
  const noun = holdingClass === 'vehicle' ? 'vehicle' : holdingClass === 'metal' ? 'gold or silver item' : 'vehicle or item'
  return (
    <>
      <Shell
        name={name}
        label={label}
        error={error}
        hint={metal ? `${purityLabel(selected.class, selected.purity)} · ${held} held` : undefined}
        action={
          allowCreate && (
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setCreating(true)}>
              <PlusIcon /> New {holdingClass === 'vehicle' ? 'vehicle' : 'item'}
            </Button>
          )
        }
      >
        <NativeSelect {...aria(name, error)} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">{optional ? 'None' : `Choose a ${noun}…`}</option>
          <KeepSelected value={value} ids={options.map((h) => h.id)} pending={isPending} label="Selected item" />
          {classes.map((c) => {
            const group = options.filter((h) => h.class === c)
            return (
              group.length > 0 && (
                <optgroup key={c} label={HOLDING_CLASSES[c].label}>
                  {group.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.code}
                      {h.name ? ` · ${h.name}` : ''}
                    </option>
                  ))}
                </optgroup>
              )
            )
          })}
        </NativeSelect>
        <input type="hidden" name={names.cls} value={selected?.class ?? ''} />
      </Shell>
      {weight && metal && (
        <>
          {weight === 'sell' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={names.whole}
                value="true"
                checked={whole}
                onChange={(e) => setWhole(e.target.checked)}
                className="accent-primary"
              />
              Sell the whole item ({held})
            </label>
          )}
          {!(weight === 'sell' && whole) && (
            <WeightInputs
              names={names}
              label={weightLabel ?? (weight === 'sell' ? 'Weight sold' : 'Weight bought')}
              defaultWeight={weightValues.weight}
              defaultUnit={weightValues.unit}
              error={weightError}
            />
          )}
        </>
      )}
      {allowCreate && (
        <HoldingFormDialog
          open={creating}
          onOpenChange={setCreating}
          classes={classes}
          onSave={async (cls, input) => {
            const created = await createHolding(current.id, cls, input)
            await qc.invalidateQueries({ queryKey: holdingKeys.all(current.id) })
            setValue(created.id)
            toast.success(`${created.code} added`)
          }}
        />
      )}
    </>
  )
}

/** Weight + unit, with a read-back in grams so a slip between tola and grams is caught before saving. */
function WeightInputs({
  names,
  label,
  defaultWeight,
  defaultUnit,
  error,
}: {
  names: WeightNames
  label: string
  defaultWeight?: string
  defaultUnit?: string
  error?: string
}) {
  const [qty, setQty] = useState(defaultWeight ?? '')
  const [unit, setUnit] = useState(isWeightUnit(defaultUnit) ? defaultUnit : 'tola')
  let readBack: string | undefined
  try {
    if (qty.trim() && unit !== 'g') readBack = `= ${formatWeight(unitToGrams(parseWeight(qty), unit), 'g')}`
  } catch {
    readBack = undefined
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,8rem)] gap-3">
      <Shell name={names.weight} label={label} error={error} hint={readBack}>
        <Input {...aria(names.weight, error, readBack)} inputMode="decimal" autoComplete="off" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
      </Shell>
      <Shell name={names.unit} label="Unit">
        <NativeSelect {...aria(names.unit)} value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
          {WEIGHT_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </NativeSelect>
      </Shell>
    </div>
  )
}

export { Shell as FieldShell }
