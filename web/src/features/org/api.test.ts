import { describe, expect, it } from 'vitest'
import type { Org } from './api'
import { pickCurrentOrg } from './current'

const org = (id: string): Org => ({
  id,
  name: `Org ${id}`,
  currency: 'PKR',
  fiscal_year_start_month: 7,
  role: 'owner',
})

describe('pickCurrentOrg', () => {
  const orgs = [org('a'), org('b')]

  it('uses the saved organization when the user still belongs to it', () => {
    expect(pickCurrentOrg(orgs, 'b')?.id).toBe('b')
  })

  it('falls back to the first organization when nothing is saved', () => {
    expect(pickCurrentOrg(orgs, null)?.id).toBe('a')
  })

  it('falls back when the saved organization is no longer available', () => {
    expect(pickCurrentOrg(orgs, 'removed')?.id).toBe('a')
  })

  it('returns null for users without an organization', () => {
    expect(pickCurrentOrg([], 'a')).toBeNull()
  })
})
