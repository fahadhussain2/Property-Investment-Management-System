import type { Org } from './api'

const STORAGE_KEY = 'property-ledger.current-org'

/** Saved choice if still valid, else the first organization. */
export function pickCurrentOrg(orgs: Org[], savedId: string | null): Org | null {
  return orgs.find((o) => o.id === savedId) ?? orgs[0] ?? null
}

// Browser storage is a convenience only; it can be unavailable (private mode, blocked site data).
export function readSavedOrg(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveCurrentOrg(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}
