import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { useAuth } from '@/features/auth/AuthProvider'
import { fetchMyOrganizations, orgKeys, type Org, type Role } from './api'
import { pickCurrentOrg, readSavedOrg, saveCurrentOrg } from './current'

type OrgState = {
  orgs: Org[]
  current: Org
  role: Role
  canWrite: boolean
  setCurrent: (id: string) => void
}

const OrgContext = createContext<OrgState | null>(null)

/** Loads the user's organizations. Users without one are sent to onboarding. */
export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session!.user.id
  const [savedId, setSavedId] = useState(readSavedOrg)
  const { data: orgs, isLoading, isFetching, error } = useQuery({
    queryKey: orgKeys.mine(userId),
    queryFn: fetchMyOrganizations,
  })

  const setCurrent = useCallback((id: string) => {
    saveCurrentOrg(id)
    setSavedId(id)
  }, [])

  if (isLoading) return <FullPageSpinner />
  if (error) throw error
  const current = pickCurrentOrg(orgs ?? [], savedId)
  if (!current && isFetching) return <FullPageSpinner />
  if (!current) return <Navigate to="/onboarding" replace />

  return (
    <OrgContext.Provider
      value={{
        orgs: orgs!,
        current,
        role: current.role,
        canWrite: current.role !== 'viewer',
        setCurrent,
      }}
    >
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider>')
  return ctx
}
