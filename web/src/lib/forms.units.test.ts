import { describe, expect, it } from 'vitest'
import { friendlyError } from './forms'

// Spec 006: the database's unit and lease messages, as Postgres / PostgREST return them.
describe('friendlyError: units', () => {
  const cases: [string, string][] = [
    ['this unit already has a lease for these dates', 'This unit already has a lease for these dates.'],
    ['the whole property is rented for these dates', 'The whole property is rented for these dates.'],
    ['a unit of this property is rented for these dates', 'A unit of this property is rented for these dates'],
    [
      'this tenant has more than one lease on this property on that date: choose the lease',
      'Choose the lease the payment is for.',
    ],
    ['duplicate key value violates unique constraint "property_units_name_idx"', 'already has a unit with that name'],
    ['new row for relation "property_units" violates check constraint "property_units_name_check"', 'up to 60 characters'],
    [
      'update or delete on table "property_units" violates foreign key constraint "leases_unit_fkey" on table "leases"',
      'This unit has leases, so it can’t be deleted.',
    ],
    [
      'insert or update on table "leases" violates foreign key constraint "leases_unit_fkey"',
      'This unit belongs to another property.',
    ],
  ]
  it.each(cases)('%s', (message, expected) => {
    expect(friendlyError(new Error(message))).toContain(expected)
  })

  it('keeps the whole-property message for a property without units', () => {
    expect(friendlyError(new Error('this property already has a lease for these dates'))).toBe(
      'This property already has a lease for these dates. End the current lease first, or change the dates.',
    )
  })
})
