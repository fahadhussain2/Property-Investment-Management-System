import { describe, expect, it } from 'vitest'
import { friendlyError } from './forms'

// Spec 007: the registers' table errors, as Postgres / PostgREST return them. The functions' own messages are
// already plain sentences and pass through unchanged.
describe('friendlyError: registers', () => {
  const cases: [string, string][] = [
    ['duplicate key value violates unique constraint "registers_name_idx"', 'You already have a register with that name.'],
    ['new row for relation "registers" violates check constraint "registers_name_check"', 'up to 60 characters'],
    [
      'update or delete on table "registers" violates foreign key constraint "register_entries_org_id_register_id_fkey" on table "register_entries"',
      'This register has entries, so it can’t be deleted. Archive it instead.',
    ],
  ]
  it.each(cases)('%s', (message, expected) => {
    expect(friendlyError(new Error(message))).toContain(expected)
  })

  it('lets the functions’ own sentences through', () => {
    for (const m of [
      'A register entry cannot be dated in the future.',
      'This register is archived. Restore it to add entries.',
      'This entry is already voided.',
    ])
      expect(friendlyError(new Error(m))).toBe(m)
  })
})
