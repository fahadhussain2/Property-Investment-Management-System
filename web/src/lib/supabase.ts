import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Locally, run `npm run dev` (it reads them from `supabase status`).',
  )
}

export const supabase = createClient<Database>(url, anonKey)

/** Unwraps a Supabase response, throwing its error so TanStack Query can surface it. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
