import { z } from 'zod'
import { optionalText } from '@/features/properties/schema'

const ROLE_VALUES = ['seller', 'buyer', 'tenant', 'agent', 'partner', 'other'] as const

export const partySchema = z.object({
  name: z.string().trim().min(2, 'Enter the name').max(100, 'Keep it under 100 characters'),
  phone: optionalText(30).refine((v) => !v || /^[+\d][\d\s-]{6,}$/.test(v), 'Enter a phone number, e.g. 0300-1234567'),
  email: optionalText(120).refine((v) => !v || z.email().safeParse(v).success, 'Enter a valid email address'),
  // Pakistani CNIC, stored in the usual dashed form 12345-1234567-1.
  cnic: optionalText(15)
    .refine((v) => !v || /^\d{5}-?\d{7}-?\d$/.test(v), 'CNIC has 13 digits, e.g. 35202-1234567-1')
    .transform((v) => (v ? v.replace(/-/g, '').replace(/^(\d{5})(\d{7})(\d)$/, '$1-$2-$3') : null)),
  address: optionalText(200),
  roles: z
    .preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(ROLE_VALUES)))
    .refine((r) => r.length > 0, 'Pick at least one role'),
  notes: optionalText(1000),
})
export type PartyInput = z.infer<typeof partySchema>
