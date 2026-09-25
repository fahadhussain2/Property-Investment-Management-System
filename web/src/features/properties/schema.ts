import { z } from 'zod'
import { AREA_UNITS } from '@/lib/labels'
import { compare, parseMoney } from '@/lib/money'

/** Optional free text: trimmed, empty becomes null (stored as NULL, not ''). */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .optional()
    .transform((v) => v || null)

export const propertySchema = z.object({
  code: z.string().trim().min(1, 'Enter a short code, e.g. DP-25').max(30, 'Keep the code under 30 characters'),
  name: optionalText(100),
  kind: z.enum(['house', 'apartment', 'shop', 'plot', 'office', 'other']),
  address: optionalText(200),
  city: optionalText(60),
  area: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0), 'Enter a positive number, e.g. 5 or 10.5')
    .transform((v) => (v ? Number(v) : null)),
  area_unit: z.enum(AREA_UNITS).optional().or(z.literal('').transform(() => undefined)),
  notes: optionalText(1000),
})
export type PropertyInput = z.infer<typeof propertySchema>

export const forSaleSchema = z.object({
  asking_price: z
    .string()
    .trim()
    .min(1, 'Enter the asking price')
    .transform((v, ctx) => {
      try {
        const m = parseMoney(v)
        if (compare(m, '0.00') <= 0) throw new Error()
        return m
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount like 15,000,000' })
        return z.NEVER
      }
    }),
})
