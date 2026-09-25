import { z } from 'zod'

export type FieldErrors = Partial<Record<string, string>>

/** Validates FormData against a zod schema. Returns parsed data or the first error per field. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  form: HTMLFormElement,
): { data: z.infer<S>; errors: null } | { data: null; errors: FieldErrors } {
  const raw = Object.fromEntries(new FormData(form).entries())
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
  if (msg.includes('Invalid login credentials')) return 'Wrong email or password.'
  if (msg.includes('User already registered')) return 'An account with this email already exists. Sign in instead.'
  return msg
}
