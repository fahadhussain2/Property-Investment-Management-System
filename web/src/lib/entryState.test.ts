import { describe, expect, it } from 'vitest'
import { entryState } from './entryState'

const v = (status: 'posted' | 'reversed', reverses_id: string | null = null, replaced_by_id: string | null = null) => ({
  status,
  reverses_id,
  replaced_by_id,
})

// The label beside an entry that no longer counts (product owner, 2026-10-11).
describe('entryState', () => {
  it('a live entry has no label', () => {
    expect(entryState(v('posted'))).toBeNull()
  })
  it('the original of an edit is Corrected, a reversed entry without a replacement is Voided', () => {
    expect(entryState(v('reversed', null, 'new-id'))).toBe('corrected')
    expect(entryState(v('reversed'))).toBe('voided')
  })
  it('the entry that cancels another is the Reversal', () => {
    expect(entryState(v('posted', 'orig-id'))).toBe('reversal')
  })
})
