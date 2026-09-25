import { describe, expect, it } from 'vitest'
import { loginSchema, signupSchema } from './auth/schema'
import { inviteSchema } from './members/schema'
import { onboardingSchema } from './org/schema'
import { categorySchema, moneyAccountSchema } from './accounts/schema'
import { partySchema } from './parties/schema'
import { forSaleSchema, propertySchema } from './properties/schema'

describe('form schemas', () => {
  it('normalises emails and requires a password on login', () => {
    expect(loginSchema.parse({ email: '  Fahad@Example.COM ', password: 'x' }).email).toBe('fahad@example.com')
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
  })

  it('requires 8+ character passwords on signup; business name is optional (invites)', () => {
    expect(signupSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false)
    const invited = signupSchema.parse({ email: 'a@b.co', password: 'longenough' })
    expect(invited.businessName).toBe('')
    expect(signupSchema.parse({ email: 'a@b.co', password: 'longenough', businessName: ' Hussain Estates ' }).businessName).toBe(
      'Hussain Estates',
    )
  })

  it('validates onboarding: name, 3-letter currency, month 1–12', () => {
    expect(onboardingSchema.parse({ name: 'Hussain Estates', currency: 'pkr', fiscalYearStartMonth: '7' })).toEqual({
      name: 'Hussain Estates',
      currency: 'PKR',
      fiscalYearStartMonth: 7,
    })
    expect(onboardingSchema.safeParse({ name: 'H', currency: 'PKR', fiscalYearStartMonth: '7' }).success).toBe(false)
    expect(onboardingSchema.safeParse({ name: 'Hussain', currency: 'RUPEES', fiscalYearStartMonth: '7' }).success).toBe(false)
    expect(onboardingSchema.safeParse({ name: 'Hussain', currency: 'PKR', fiscalYearStartMonth: '13' }).success).toBe(false)
  })

  it('invites only with a valid email and a known role', () => {
    expect(inviteSchema.parse({ email: 'Staff@X.com', role: 'accountant' })).toEqual({ email: 'staff@x.com', role: 'accountant' })
    expect(inviteSchema.safeParse({ email: 'staff@x.com', role: 'admin' }).success).toBe(false)
  })
})

describe('M3 master-data schemas', () => {
  it('property: code required, optional text becomes null, area must be positive', () => {
    const p = propertySchema.parse({ code: ' DP-25 ', kind: 'house', name: '', area: '10', area_unit: 'marla' })
    expect(p).toMatchObject({ code: 'DP-25', name: null, area: 10, area_unit: 'marla' })
    expect(propertySchema.safeParse({ code: '', kind: 'house' }).success).toBe(false)
    expect(propertySchema.safeParse({ code: 'X', kind: 'house', area: '-5' }).success).toBe(false)
    expect(propertySchema.safeParse({ code: 'X', kind: 'castle' }).success).toBe(false)
  })

  it('asking price accepts grouped amounts and rejects zero', () => {
    expect(forSaleSchema.parse({ asking_price: '15,000,000' }).asking_price).toBe('15000000.00')
    expect(forSaleSchema.safeParse({ asking_price: '0' }).success).toBe(false)
    expect(forSaleSchema.safeParse({ asking_price: 'fifteen' }).success).toBe(false)
  })

  it('party: roles from checkboxes (one or many), CNIC normalised to dashed form', () => {
    expect(partySchema.parse({ name: 'Ali Raza', roles: 'seller' }).roles).toEqual(['seller'])
    expect(partySchema.parse({ name: 'Ali Raza', roles: ['seller', 'buyer'] }).roles).toEqual(['seller', 'buyer'])
    expect(partySchema.safeParse({ name: 'Ali Raza' }).success).toBe(false)
    expect(partySchema.parse({ name: 'Ali Raza', roles: 'tenant', cnic: '3520212345671' }).cnic).toBe('35202-1234567-1')
    expect(partySchema.safeParse({ name: 'Ali Raza', roles: 'tenant', cnic: '1234' }).success).toBe(false)
    expect(partySchema.safeParse({ name: 'Ali Raza', roles: 'tenant', email: 'nope' }).success).toBe(false)
  })

  it('accounts: only user-creatable kinds', () => {
    expect(categorySchema.safeParse({ kind: 'property_expense', name: 'Generator fuel' }).success).toBe(true)
    expect(categorySchema.safeParse({ kind: 'sales', name: 'Fake' }).success).toBe(false)
    expect(moneyAccountSchema.parse({ kind: 'bank', name: 'Meezan', bank_name: '' }).bank_name).toBeNull()
  })
})
