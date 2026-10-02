import { describe, expect, it } from 'vitest'
import { leaseSchema, WHOLE_PROPERTY } from './schema'

// Spec 006: the lease form's unit choice.
const base = { property_id: 'p', party_id: 't', start_date: '2026-10-02', monthly_rent: '50000' }

describe('lease form: unit', () => {
  it('a property with units needs an explicit choice', () => {
    const r = leaseSchema.safeParse({ ...base, unit_state: 'some', unit_id: '' })
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(['unit_id'])
  })

  it('"Whole property" is saved as no unit, and counts as chosen', () => {
    expect(leaseSchema.parse({ ...base, unit_state: 'some', unit_id: WHOLE_PROPERTY })).toMatchObject({ unit_id: null, unit_chosen: true })
  })

  it('a unit is saved as its id', () => {
    expect(leaseSchema.parse({ ...base, unit_state: 'some', unit_id: 'u1' })).toMatchObject({ unit_id: 'u1', unit_chosen: true })
  })

  it('while the units load (or failed, or there are none) nothing is refused here: the dialog checks before saving', () => {
    for (const unit_state of ['loading', 'error', 'none'] as const) {
      expect(leaseSchema.parse({ ...base, unit_state })).toMatchObject({ unit_id: null, unit_chosen: false })
    }
  })
})
