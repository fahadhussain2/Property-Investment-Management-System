import { z } from 'zod'
import { optionalText } from '@/features/properties/schema'
import { compare, parseMoney } from '@/lib/money'

const DATE = /^\d{4}-\d{2}-\d{2}$/

const money = (message: string, { required }: { required: boolean }) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) {
        if (required) ctx.addIssue({ code: 'custom', message })
        return '0.00'
      }
      try {
        const m = parseMoney(v)
        if (compare(m, '0.00') < 0 || (required && compare(m, '0.00') === 0)) throw new Error()
        return m
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount like 50,000' })
        return z.NEVER
      }
    })

/** The day rent falls due each month: 1–28 (so every month has it). Empty = the start date's day. */
export const defaultDueDay = (start: string) => Math.min(Number(start.slice(8, 10)) || 1, 28)

export const leaseSchema = z
  .object({
    property_id: z.string().min(1, 'Choose the property'),
    party_id: z.string().min(1, 'Choose the tenant'),
    start_date: z.string().regex(DATE, 'Pick the start date'),
    end_date: z
      .string()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || DATE.test(v), 'Pick a date'),
    monthly_rent: money('Enter the monthly rent', { required: true }),
    security_deposit: money('', { required: false }),
    rent_due_day: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 28),
        'Enter a day from 1 to 28',
      ),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'The end date must be after the start date',
      })
    }
  })
  .transform((v) => ({
    ...v,
    rent_due_day: v.rent_due_day ? Number(v.rent_due_day) : defaultDueDay(v.start_date),
  }))
export type LeaseInput = z.infer<typeof leaseSchema>

export const endLeaseSchema = z.object({
  ended_on: z.string().regex(DATE, 'Pick the date the tenant left'),
})
