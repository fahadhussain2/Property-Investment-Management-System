import { compare, parseMoney } from '@/lib/money'
import { isWeightUnit, parseWeight } from '@/lib/quantity'
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
  holding: 'Choose the vehicle or item',
}

/** Paid/received in full needs no seller/buyer; only a balance left owing does (checked below). */
const PARTY_OPTIONAL = ['purchase', 'holding_purchase', 'holding_sale']
/** A seller/buyer balance belongs to a property OR a vehicle / gold / silver item (checked below). */
const PROPERTY_OR_ITEM = ['pay_seller', 'receive_buyer']

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
      case 'holding': {
        payload[f.name] = raw || null
        if (!raw && !f.optional) errors[f.name] = PICK_MESSAGE.holding
        if (!f.weight) break
        // Gold/silver only (the picker sends the chosen item's class). Every key is always present, so a
        // correction that switches from a weight to "the whole item" clears the old weight (edit merges).
        payload.weight = null
        payload.unit = null
        if (f.weight === 'sell') payload.whole = null
        const metal = v('holding_class') === 'gold' || v('holding_class') === 'silver'
        if (!metal) break
        if (f.weight === 'sell' && v('whole') === 'true') {
          payload.whole = 'true'
          break
        }
        try {
          payload.weight = parseWeight(v('weight'))
        } catch {
          errors.weight = v('weight') ? 'Enter a weight like 10 or 2.5 (up to 3 decimals)' : 'Enter the weight'
        }
        payload.unit = isWeightUnit(v('unit')) ? v('unit') : 'tola'
        break
      }
      default: {
        // pickers: property, party, money_account, to_account, category
        payload[f.name] = raw || null
        const optional =
          f.optional ||
          (f.kind === 'party' && PARTY_OPTIONAL.includes(entry.type)) ||
          (f.kind === 'property' && PROPERTY_OR_ITEM.includes(entry.type)) ||
          (f.inLease && !!v('lease_id'))
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
  if ((entry.type === 'purchase' || entry.type === 'holding_purchase') && payload.price && !errors.paid_now) {
    const paid = payload.paid_now ?? '0.00'
    if (compare(paid, payload.price) > 0) errors.paid_now = 'Paid now can’t be more than the price'
    else if (compare(paid, payload.price) < 0 && !payload.party_id)
      errors.party_id = 'Choose the seller: part of the price is still owed'
  }
  if ((entry.type === 'sale' || entry.type === 'holding_sale') && payload.price && payload.received_now && compare(payload.received_now, payload.price) > 0) {
    errors.received_now = 'Received now can’t be more than the sale price'
  }
  if (entry.type === 'holding_sale' && payload.price && !errors.received_now && !payload.party_id &&
      compare(payload.received_now ?? '0.00', payload.price) < 0) {
    errors.party_id = 'Choose the buyer: part of the price is still to be received'
  }
  if (PROPERTY_OR_ITEM.includes(entry.type)) {
    if (!payload.property_id && !payload.holding_id) errors.property_id = 'Choose the property, or the vehicle / gold / silver item'
    else if (payload.property_id && payload.holding_id) errors.holding_id = 'Choose a property or an item, not both'
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
