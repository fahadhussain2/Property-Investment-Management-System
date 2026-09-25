import { ChevronRightIcon, LandmarkIcon, ListTreeIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { useOrg } from '@/features/org/OrgProvider'
import { MONTHS } from '@/features/org/schema'

export function SettingsPage() {
  const { current } = useOrg()
  const sections = [
    { to: '/settings/members', label: 'Members & invitations', icon: UsersIcon, ready: true },
    { to: '/settings', label: 'Bank & cash accounts (M3)', icon: LandmarkIcon, ready: false },
    { to: '/settings', label: 'Chart of accounts (M3)', icon: ListTreeIcon, ready: false },
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
    </>
  )
}
