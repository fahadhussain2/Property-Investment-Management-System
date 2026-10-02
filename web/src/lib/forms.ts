import { z } from 'zod'

export type FieldErrors = Partial<Record<string, string>>

/** Validates FormData against a zod schema. Returns parsed data or the first error per field. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  form: HTMLFormElement,
): { data: z.infer<S>; errors: null } | { data: null; errors: FieldErrors } {
  // Repeated names (e.g. checkbox groups) become arrays; single values stay strings.
  const raw: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {}
  for (const [key, value] of new FormData(form).entries()) {
    const prev = raw[key]
    raw[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value]
  }
  const result = schema.safeParse(raw)
  if (result.success) return { data: result.data, errors: null }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form')
    errors[key] ??= issue.message
  }
  return { data: null, errors }
}

/** Turns known database error messages into plain language for the user. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('not a member of this organization with role'))
    return 'Your role in this business is view-only. Ask an owner if you need to record entries.'
  if (msg.includes('at least one owner')) return 'A business must always have at least one owner.'
  if (msg.includes('invitations_pending_idx')) return 'This email already has a pending invitation.'
  if (msg.includes('row-level security')) return 'You do not have permission to do that.'
  if (msg.includes('property is already sold')) return 'This property is already sold.'
  if (msg.includes('paid_now exceeds price')) return 'Paid now can’t be more than the price.'
  if (msg.includes('plus advances') && msg.includes('exceeds sale price'))
    return 'Money received now plus token money already received is more than the sale price.'
  if (msg.includes('choose an active cash or bank account')) return 'Choose an active cash or bank account.'
  if (msg.includes('reverse the sale of this property first'))
    return 'This property has been sold. Void the sale first, then change its purchase or costs.'
  if (msg.includes('already reversed')) return 'This entry has already been voided.'
  if (msg.includes('journal is unbalanced')) return 'Debits and credits must be equal.'
  if (msg.includes('bring it to zero')) return 'This account still has money in it. Move the balance out before hiding it.'
  if (msg.includes('system accounts')) return 'Built-in accounts can be renamed, but not hidden or deleted.'
  if (msg.includes('type cannot be changed')) return 'An account keeps its type. Add a new account instead.'
  // Units (spec 006): checked before the whole-property message, which shares its wording.
  if (msg.includes('this unit already has a lease for these dates'))
    return 'This unit already has a lease for these dates. End the current lease first, or change the dates.'
  if (msg.includes('the whole property is rented for these dates'))
    return 'The whole property is rented for these dates. End that lease first, or change the dates.'
  if (msg.includes('a unit of this property is rented for these dates'))
    return 'A unit of this property is rented for these dates, so it can’t be rented as a whole. End the unit’s lease first, or change the dates.'
  if (msg.includes('more than one lease on this property on that date'))
    return 'This tenant rents more than one unit here on that date. Choose the lease the payment is for.'
  if (msg.includes('property_units_name_idx')) return 'This property already has a unit with that name.'
  if (msg.includes('property_units_name_check')) return 'Enter a unit name of up to 60 characters.'
  if (msg.includes('leases_unit_fkey'))
    return msg.includes('on table "property_units"')
      ? 'This unit has leases, so it can’t be deleted.'
      : 'This unit belongs to another property. Choose one of this property’s units.'
  if (msg.includes('already has a lease for these dates'))
    return 'This property already has a lease for these dates. End the current lease first, or change the dates.'
  if (msg.includes('sold and cannot be rented')) return 'This property is sold, so it cannot be rented out.'
  if (msg.includes('its property and tenant cannot change'))
    return 'Rent or deposits are recorded against this lease, so its property and tenant cannot change. End it and add a new lease instead.'
  if (msg.includes('leases_check')) return 'The dates are out of order: a lease cannot end before it starts.'
  if (msg.includes('properties_org_code_idx')) return 'Another property already uses this code.'
  // Vehicles, gold and silver (spec 003)
  if (msg.includes('holdings_org_code_idx')) return 'Another vehicle or item already uses this code.'
  if (msg.includes('is already recorded as bought')) return 'This vehicle’s purchase is already recorded. To change it, correct that entry.'
  if (msg.includes('is more than the weight held')) return 'You can’t sell more than the weight held. Tick “Sell the whole item” to sell all of it.'
  if (msg.includes('cannot go below zero')) return 'That would take out more weight than the item holds.'
  if (/reverse the sale of .+ first/.test(msg))
    return 'This item has a sale recorded. Void the sale first, then change its purchase or costs.'
  if (msg.includes('no cost is recorded for this sale')) return 'Record what this item cost you first (its purchase or opening balance).'
  if (/record the purchase of .+ first/.test(msg)) return 'Record the purchase of this item first.'
  if (msg.includes('only a vehicle can be tagged')) return 'Only a vehicle can be picked for an expense.'
  if (msg.includes('not both')) return 'Choose a property or a vehicle / gold / silver item, not both.'
  if (/ is already sold/.test(msg)) return 'This is already sold.'
  if (msg.includes('violates foreign key constraint') && msg.includes('on table "documents"'))
    return 'This record has documents attached. Delete them first (in its Documents section).'
  if (msg.includes('violates foreign key constraint'))
    return 'This record has entries linked to it, so it cannot be deleted.'
  // Documents (spec 004): Storage's own limits, then add_document's checks
  if (msg.includes('exceeded the maximum allowed size')) return 'This file is over the 10 MB limit.'
  if (/mime type .* is not supported/.test(msg)) return 'This type of file can’t be kept. Use PDF, JPG, PNG, WebP or HEIC.'
  if (msg.includes('The resource already exists')) return 'This file was already uploaded. Try again.'
  if (msg.includes('linked record not found')) return 'The record this document belongs to no longer exists.'
  if (msg.includes('file not uploaded')) return 'The upload did not finish. Try again.'
  if (msg.includes('Invalid login credentials')) return 'Wrong email or password.'
  if (msg.includes('Email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.'
  if (msg.includes('should be different from the old password')) return 'Choose a password different from your old one.'
  if (msg.includes('For security purposes, you can only request this after') || msg.includes('rate limit'))
    return 'Too many emails were requested. Wait a minute and try again.'
  if (msg.includes('User already registered')) return 'An account with this email already exists. Sign in instead.'
  return msg
}
