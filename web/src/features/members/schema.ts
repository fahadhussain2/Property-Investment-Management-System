import { z } from 'zod'

export const ROLES = [
  { value: 'owner', label: 'Owner', help: 'Everything, including members and settings' },
  { value: 'accountant', label: 'Accountant', help: 'Records entries and manages properties' },
  { value: 'viewer', label: 'Viewer', help: 'Can only look at records and reports' },
] as const

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  role: z.enum(['owner', 'accountant', 'viewer']),
})

export type InviteInput = z.infer<typeof inviteSchema>
