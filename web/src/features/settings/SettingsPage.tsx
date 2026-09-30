import { useQuery } from '@tanstack/react-query'
import { ChevronRightIcon, HardDriveIcon, LandmarkIcon, ListTreeIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { documentKeys, fetchStorageUsed } from '@/features/documents/api'
import { useOrg } from '@/features/org/OrgProvider'
import { MONTHS } from '@/features/org/schema'
import { formatBytes } from '@/lib/files'

/** The free tier gives the whole project 1 GB of file storage, shared by every business on it. */
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024

export function SettingsPage() {
  const { current } = useOrg()
  const used = useQuery({ queryKey: documentKeys.used(current.id), queryFn: () => fetchStorageUsed(current.id) })
  const sections = [
    { to: '/settings/members', label: 'Members & invitations', icon: UsersIcon, ready: true },
    { to: '/settings/accounts/money', label: 'Bank & cash accounts', icon: LandmarkIcon, ready: true },
    { to: '/settings/accounts', label: 'Chart of accounts', icon: ListTreeIcon, ready: true },
  ]
  return (
    <>
      <PageHeader
        title="Settings"
        description={`${current.name} · ${current.currency} · financial year starts in ${MONTHS[current.fiscal_year_start_month - 1]}`}
      />
      <div className="divide-y rounded-lg border">
        {sections.map(({ to, label, icon: Icon, ready }) =>
          ready ? (
            <Link key={label} to={to} className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-accent">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          ) : (
            <div key={label} className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
            </div>
          ),
        )}
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-muted-foreground">Storage</h2>
      {used.isPending ? (
        <SectionLoading label="Loading storage used…" />
      ) : used.isError ? (
        <SectionError error={used.error} onRetry={() => used.refetch()} />
      ) : (
        <div className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
          <HardDriveIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p data-testid="storage-used">
              Storage used: {formatBytes(used.data)} of 1 GB
            </p>
            <p className="text-muted-foreground">The 1 GB free storage is shared by every business on this system.</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, (used.data / STORAGE_LIMIT_BYTES) * 100)}%` }} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
