import { z } from 'zod'
import { optionalText } from '@/features/properties/schema'
import { compare, parseMoney } from '@/lib/money'

const code = z.string().trim().min(1, 'Enter a short code, e.g. CAR-1').max(30, 'Keep the code under 30 characters')

export const vehicleSchema = z.object({
  code,
  name: optionalText(100),
  make: optionalText(60),
  model: optionalText(60),
  year: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (/^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= 2100), 'Enter a year like 2022')
    .transform((v) => (v ? Number(v) : null)),
  // Whole cc, commas allowed ("1,300"); the database allows 1 to 20,000.
  engine_cc: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ?? '').replace(/[,\s]/g, ''))
    .refine((v) => !v || (/^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 20000), 'Enter the engine capacity in cc, e.g. 1300')
    .transform((v) => (v ? Number(v) : null)),
  registration_no: optionalText(30),
  chassis_no: optionalText(40),
  engine_no: optionalText(40),
  colour: optionalText(30),
  notes: optionalText(1000),
})

export const metalSchema = z.object({
  code,
  name: optionalText(100),
  // A fraction as a decimal string ("0.9167"); PostgREST casts it to numeric exactly.
  purity: z.string().regex(/^(0\.\d{1,4}|1(\.0{1,4})?)$/, 'Choose the purity'),
  notes: optionalText(1000),
})

export type VehicleInput = z.infer<typeof vehicleSchema>
export type MetalInput = z.infer<typeof metalSchema>
export type HoldingInput = VehicleInput | MetalInput

export const rateSchema = z.object({
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  rate_per_tola: z
    .string()
    .trim()
    .min(1, 'Enter the rate per tola')
    .transform((v, ctx) => {
      try {
        const m = parseMoney(v)
        if (compare(m, '0.00') <= 0) throw new Error()
        return m
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount like 250,000' })
        return z.NEVER
      }
    }),
})
export type RateInput = z.infer<typeof rateSchema>
