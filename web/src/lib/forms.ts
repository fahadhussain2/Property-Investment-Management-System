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
  if (msg.includes('already has a lease for these dates'))
    return 'This property already has a lease for these dates. End the current lease first, or change the dates.'
  if (msg.includes('sold and cannot be rented')) return 'This property is sold, so it cannot be rented out.'
  if (msg.includes('its property and tenant cannot change'))
    return 'Rent or deposits are recorded against this lease, so its property and tenant cannot change. End it and add a new lease instead.'
  if (msg.includes('leases_check')) return 'The dates are out of order: a lease cannot end before it starts.'
  if (msg.includes('properties_org_code_idx')) return 'Another property already uses this code.'
  if (msg.includes('violates foreign key constraint'))
    return 'This record has entries linked to it, so it cannot be deleted.'
  if (msg.includes('Invalid login credentials')) return 'Wrong email or password.'
  if (msg.includes('User already registered')) return 'An account with this email already exists. Sign in instead.'
  return msg
}
