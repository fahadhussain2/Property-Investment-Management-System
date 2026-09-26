import { compare, parseMoney } from '@/lib/money'
import type { FieldErrors } from '@/lib/forms'
import type { EntryType } from './types'

export type FormValues = Record<string, string>
export type Payload = Record<string, string | null>

const isPositive = (m: string) => compare(m, '0.00') > 0

const PICK_MESSAGE: Partial<Record<string, string>> = {
  money_account: 'Choose a cash or bank account',
  to_account: 'Choose a cash or bank account',
  category: 'Choose a head of account',
  property: 'Choose the property',
}

/**
 * Validates entry form values and builds the post_voucher payload.
 * Every field of the type is present in the payload (empty -> null). This matters for editing:
 * edit_voucher merges changes over the old payload, so a cleared field must be sent as null.
 */
export function buildPayload(
  entry: EntryType,
  values: FormValues,
): { payload: Payload; errors: null } | { payload: null; errors: FieldErrors } {
  const errors: FieldErrors = {}
  const payload: Payload = { type: entry.type }
  const v = (name: string) => (values[name] ?? '').trim()

  for (const f of entry.fields) {
    const raw = v(f.name)
    switch (f.kind) {
      case 'money':
      case 'optional_money': {
        if (!raw) {
          if (f.kind === 'money') errors[f.name] = `Enter the ${f.label.toLowerCase()}`
          payload[f.name] = null
          break
        }
        try {
          const m = parseMoney(raw)
          if (compare(m, '0.00') < 0 || (f.kind === 'money' && !isPositive(m))) throw new Error()
          payload[f.name] = m
        } catch {
          errors[f.name] = 'Enter an amount like 1,500,000'
        }
        break
      }
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) errors[f.name] = 'Pick a date'
        payload[f.name] = raw || null
        break
      case 'period':
        payload[f.name] = /^\d{4}-\d{2}$/.test(raw) ? raw : null
        break
      case 'direction':
        payload[f.name] = raw === 'refunded' ? 'refunded' : 'received'
        break
      case 'memo':
      case 'lease':
        payload[f.name] = raw || null
        break
      default: {
        // pickers: property, party, money_account, to_account, category
        payload[f.name] = raw || null
        const optional = f.optional || (f.kind === 'party' && entry.type === 'purchase') || (f.inLease && !!v('lease_id'))
        const conditional = f.requiredIf !== undefined
        if (!raw && !optional && !conditional) errors[f.name] = PICK_MESSAGE[f.kind] ?? `Choose the ${f.label.toLowerCase()}`
      }
    }
  }

  // Cross-field rules (the database checks these too; this gives a friendlier message first).
  for (const f of entry.fields) {
    if (f.requiredIf) {
      const m = payload[f.requiredIf]
      if (m && isPositive(m) && !payload[f.name]) errors[f.name] = 'Choose a cash or bank account'
    }
  }
  if (entry.type === 'purchase' && payload.price && !errors.paid_now) {
    const paid = payload.paid_now ?? '0.00'
    if (compare(paid, payload.price) > 0) errors.paid_now = 'Paid now can’t be more than the price'
    else if (compare(paid, payload.price) < 0 && !payload.party_id)
      errors.party_id = 'Choose the seller: part of the price is still owed'
  }
  if (entry.type === 'sale' && payload.price && payload.received_now && compare(payload.received_now, payload.price) > 0) {
    errors.received_now = 'Received now can’t be more than the sale price'
  }
  if (entry.type === 'transfer' && payload.account_id && payload.account_id === payload.to_account_id) {
    errors.to_account_id = 'Pick a different account'
  }

  return Object.keys(errors).length ? { payload: null, errors } : { payload, errors: null }
}

/** Stored payload (from an existing voucher) -> form values, for editing. */
export function payloadToValues(payload: Record<string, unknown> | null): FormValues {
  const out: FormValues = {}
  for (const [k, val] of Object.entries(payload ?? {})) {
    if (k !== 'type' && val !== null && val !== undefined) out[k] = String(val)
  }
  return out
}
