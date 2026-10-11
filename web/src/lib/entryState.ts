// Why an entry no longer counts, for the label beside it in entry lists. Pure, so unit tests need no environment.
// Same words as the entry's own page (EntryPage): Corrected, Voided, Reversal.

export type EntryState = 'corrected' | 'voided' | 'reversal'

type Entry = { status: 'posted' | 'reversed'; reverses_id: string | null; replaced_by_id: string | null }

/**
 * - reversal: the automatic entry that cancels another one (it carries `reverses_id`).
 * - corrected: the original of an edit (edit = reverse + repost; `replaced_by_id` points at the new entry).
 * - voided: reversed without a replacement.
 * - null: a live entry.
 */
export function entryState(v: Entry): EntryState | null {
  if (v.reverses_id !== null) return 'reversal'
  if (v.status !== 'reversed') return null
  return v.replaced_by_id !== null ? 'corrected' : 'voided'
}

export const ENTRY_STATE: Record<EntryState, { label: string; className: string }> = {
  corrected: { label: 'Corrected', className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' },
  voided: { label: 'Voided', className: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  reversal: { label: 'Reversal', className: 'border border-foreground/20 text-muted-foreground' },
}

/** The amount of an entry that no longer counts: still crossed out, with the line in red so it stands out. */
export const CANCELLED_AMOUNT = 'line-through decoration-red-600 decoration-2 dark:decoration-red-400'
