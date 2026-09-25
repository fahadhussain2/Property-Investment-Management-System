import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useOrg } from '@/features/org/OrgProvider'

/** Owners and accountants only. Viewers are sent to the day book instead of a form they cannot save. */
export function RequireWrite({ children }: { children: ReactNode }) {
  const { canWrite } = useOrg()
  if (!canWrite) return <Navigate to="/entries" replace />
  return children
}
