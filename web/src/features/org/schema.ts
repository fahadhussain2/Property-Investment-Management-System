import { z } from 'zod'

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'Enter your business name').max(100, 'Keep it under 100 characters'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. PKR'),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>
