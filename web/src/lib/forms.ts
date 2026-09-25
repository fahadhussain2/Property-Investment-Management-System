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
  if (msg.includes('at least one owner')) return 'A business must always have at least one owner.'
  if (msg.includes('invitations_pending_idx')) return 'This email already has a pending invitation.'
  if (msg.includes('row-level security')) return 'You do not have permission to do that.'
  if (msg.includes('bring it to zero')) return 'This account still has money in it. Move the balance out before hiding it.'
  if (msg.includes('system accounts')) return 'Built-in accounts can be renamed, but not hidden or deleted.'
  if (msg.includes('type cannot be changed')) return 'An account keeps its type. Add a new account instead.'
  if (msg.includes('properties_org_code_idx')) return 'Another property already uses this code.'
  if (msg.includes('violates foreign key constraint'))
    return 'This record has entries linked to it, so it cannot be deleted.'
  if (msg.includes('Invalid login credentials')) return 'Wrong email or password.'
  if (msg.includes('User already registered')) return 'An account with this email already exists. Sign in instead.'
  return msg
}
