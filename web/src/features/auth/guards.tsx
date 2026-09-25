import { useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { useAuth } from './AuthProvider'

/** Signed-in users only; others go to /login and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

/**
 * Signed-out users only (login/signup pages). Decided once, when the page opens: signing in on the
 * page itself must not redirect mid-flow (sign-up still has to create the business), so the page
 * navigates by itself when it is done.
 */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const [signedInOnArrival, setSignedInOnArrival] = useState<boolean | null>(null)
  if (loading) return <FullPageSpinner />
  if (signedInOnArrival === null) {
    setSignedInOnArrival(!!session) // derived-state update during render; React re-renders at once
    return <FullPageSpinner />
  }
  if (signedInOnArrival) return <Navigate to="/" replace />
  return children
}
