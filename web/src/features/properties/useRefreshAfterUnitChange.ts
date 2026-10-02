import { useQueryClient } from '@tanstack/react-query'
import { leaseKeys } from '@/features/leases/api'
import { useOrg } from '@/features/org/OrgProvider'
import { propertyKeys } from './api'

/** Units change labels on leases and documents too, and occupancy on the properties list. */
export function useRefreshAfterUnitChange() {
  const { current } = useOrg()
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: propertyKeys.all(current.id) }),
      qc.invalidateQueries({ queryKey: leaseKeys.all(current.id) }),
      qc.invalidateQueries({ queryKey: ['documents', current.id] }),
    ])
}
