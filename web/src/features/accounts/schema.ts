import { z } from 'zod'

const optional = z
  .string()
  .trim()
  .max(60)
  .optional()
  .transform((v) => v || null)

export const moneyAccountSchema = z.object({
  kind: z.enum(['bank', 'cash']),
  name: z.string().trim().min(2, 'Give it a name, e.g. Meezan Current').max(60),
  bank_name: optional,
  account_no: optional,
})
export type MoneyAccountInput = z.infer<typeof moneyAccountSchema>

export const categorySchema = z.object({
  kind: z.enum(['property_expense', 'vehicle_expense', 'general_expense', 'selling_expense', 'income']),
  name: z.string().trim().min(2, 'Enter a name, e.g. Generator fuel').max(60),
})

export const renameSchema = z.object({ name: z.string().trim().min(2, 'Enter a name').max(60) })
