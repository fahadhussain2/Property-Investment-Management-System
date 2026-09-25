import { ChevronRightIcon, LogOutIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { supabase } from '@/lib/supabase'
import { moreNav } from './nav'

/** Mobile-only overflow menu for sections that do not fit in the bottom tabs. */
export function MorePage() {
  const row = 'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-accent'
  return (
    <>
      <PageHeader title="More" />
      <div className="divide-y rounded-lg border">
        {moreNav.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={row}>
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1">{label}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
        <button type="button" className={row} onClick={() => supabase.auth.signOut()}>
          <LogOutIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">Sign out</span>
        </button>
      </div>
    </>
  )
}
