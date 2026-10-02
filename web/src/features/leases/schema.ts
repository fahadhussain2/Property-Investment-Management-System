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

/** The unit choice that means "the whole property" (stored as unit_id null). */
export const WHOLE_PROPERTY = 'whole'
export const UNIT_REQUIRED = 'Choose a unit, or Whole property'

/**
 * What the lease form showed for the chosen property's units (spec 006 §4), sent as a hidden field:
 * none (no units), some (a unit or "Whole property" must be chosen), loading / error (not known yet).
 * Only "some" with a choice counts as chosen; otherwise the dialog checks the units itself before saving
 * (LeaseFormDialog), waiting for them if they are still loading, so a lease never becomes a whole-property
 * lease by accident and a quick save is never refused just because the units were slow to arrive.
 */
export type UnitState = 'none' | 'some' | 'loading' | 'error'

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
    rent_counted_from: z
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
    unit_id: z.string().optional(),
    unit_state: z.enum(['none', 'some', 'loading', 'error']).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.unit_state === 'some' && !v.unit_id) {
      ctx.addIssue({ code: 'custom', path: ['unit_id'], message: UNIT_REQUIRED })
    }
    if (v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'The end date must be after the start date',
      })
    }
    if (v.rent_counted_from && v.rent_counted_from < v.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['rent_counted_from'],
        message: 'Pick a date on or after the start date',
      })
    }
  })
  .transform(({ unit_state, unit_id, ...v }) => ({
    ...v,
    unit_id: unit_state === 'some' && unit_id && unit_id !== WHOLE_PROPERTY ? unit_id : null,
    /** False when the form could not show the units: the dialog then checks them before saving. */
    unit_chosen: unit_state === 'some' && !!unit_id,
    rent_due_day: v.rent_due_day ? Number(v.rent_due_day) : defaultDueDay(v.start_date),
  }))
export type LeaseForm = z.infer<typeof leaseSchema>
/** What is saved: the form's values without unit_chosen. */
export type LeaseInput = Omit<LeaseForm, 'unit_chosen'>

export const endLeaseSchema = z.object({
  ended_on: z.string().regex(DATE, 'Pick the date the tenant left'),
})
