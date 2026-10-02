import { describe, expect, it } from 'vitest'
import { canDeleteUnit, leaseLabel, occupancyLabel, toUnitRow, unitStateLabel } from './units'

describe('units', () => {
  it('describes occupancy only for a property with units', () => {
    expect(occupancyLabel(0, 0)).toBeNull()
    expect(occupancyLabel(3, 1)).toBe('2 of 3 units rented')
    expect(occupancyLabel(2, 0)).toBe('2 of 2 units rented')
    expect(occupancyLabel(1, 1)).toBe('0 of 1 unit rented')
  })

  it('says who has a unit today', () => {
    expect(unitStateLabel({ state: 'rented', tenant_name: 'Ali Traders', lease_ends: '2027-06-30' })).toBe(
      'Rented to Ali Traders until 2027-06-30',
    )
    expect(unitStateLabel({ state: 'rented', tenant_name: 'Ali Traders', lease_ends: null })).toBe('Rented to Ali Traders')
    expect(unitStateLabel({ state: 'whole_property', tenant_name: 'Bilal', lease_ends: null })).toBe(
      'Part of the whole-property lease (Bilal)',
    )
    expect(unitStateLabel({ state: 'vacant', tenant_name: null, lease_ends: null })).toBe('Vacant')
  })

  it('offers delete only for a unit that never had a lease', () => {
    expect(canDeleteUnit({ lease_count: 0 })).toBe(true)
    expect(canDeleteUnit({ lease_count: 1 })).toBe(false)
  })

  it('names a lease with its unit, and a whole-property lease as before', () => {
    expect(leaseLabel({ property_code: 'DP-25', unit_name: 'Shop 3', tenant_name: 'Ali Traders' })).toBe('DP-25 · Shop 3 · Ali Traders')
    expect(leaseLabel({ property_code: 'DP-25', unit_name: null, tenant_name: 'Ali Traders' })).toBe('DP-25 · Ali Traders')
    expect(leaseLabel({ property_code: 'DP-25', tenant_name: 'Ali Traders' })).toBe('DP-25 · Ali Traders')
  })

  it('reads a view row', () => {
    const row = toUnitRow({ id: 'u', property_id: 'p', name: 'GF', state: 'rented', lease_count: 2, notes: null })
    expect(row).toMatchObject({ id: 'u', name: 'GF', state: 'rented', lease_count: 2, tenant_name: null })
  })
})
