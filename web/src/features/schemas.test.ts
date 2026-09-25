import { describe, expect, it } from 'vitest'
import { loginSchema, signupSchema } from './auth/schema'
import { inviteSchema } from './members/schema'
import { onboardingSchema } from './org/schema'

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
