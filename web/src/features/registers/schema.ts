import { z } from 'zod'
import { compare, parseMoney } from '@/lib/money'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .optional()
    .transform((v) => v || null)

/** A register: a name, and where it starts (spec 007 §3). The opening balance may be negative (overdrawn). */
export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name, e.g. Zakat Fund').max(60, 'Keep the name under 60 characters'),
  opening_balance: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return '0.00'
      try {
        return parseMoney(v)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount like 53,650' })
        return z.NEVER
      }
    }),
  opening_date: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
})
export type RegisterInput = z.infer<typeof registerSchema>

/**
 * A register line. A future date is refused by the database (it knows the business's own calendar, rule 8); the
 * date box only offers up to today.
 */
export const entrySchema = z.object({
  entry_date: z.string().trim().min(1, 'Choose the date'),
  description: z.string().trim().min(1, 'Enter a description').max(200, 'Keep the description under 200 characters'),
  direction: z.enum(['in', 'out'], { message: 'Choose money in or money out' }),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter the amount')
    .transform((v, ctx) => {
      try {
        const m = parseMoney(v)
        if (compare(m, '0.00') <= 0) throw new Error()
        return m
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount more than 0, with at most 2 decimals, like 25,000' })
        return z.NEVER
      }
    }),
  reason: optionalText(300),
})
export type EntryInput = z.infer<typeof entrySchema>

export const voidSchema = z.object({ reason: optionalText(300) })
export type VoidInput = z.infer<typeof voidSchema>
