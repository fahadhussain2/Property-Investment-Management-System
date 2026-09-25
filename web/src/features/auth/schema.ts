import { z } from 'zod'

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'))
const password = z.string().min(8, 'Use at least 8 characters')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
})

export const signupSchema = z.object({
  email,
  password,
  // Empty when joining through an invitation.
  businessName: z.string().trim().max(100, 'Keep it under 100 characters').optional().default(''),
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
