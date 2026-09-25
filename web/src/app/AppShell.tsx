import { Building2Icon, LogOutIcon, PlusIcon, UserIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NativeSelect } from '@/components/Field'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOrg } from '@/features/org/OrgProvider'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { bottomNav, sidebarNav } from './nav'

function OrgSwitcher() {
  const { orgs, current, setCurrent } = useOrg()
  if (orgs.length < 2) {
    return <span className="truncate font-semibold" data-testid="org-name">{current.name}</span>
  }
  return (
    <NativeSelect
      aria-label="Switch business"
      data-testid="org-switcher"
      value={current.id}
      onChange={(e) => setCurrent(e.target.value)}
      className="font-semibold"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </NativeSelect>
  )
}

function UserMenu() {
  const { session } = useAuth()
  const { role } = useOrg()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <UserIcon className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{session?.user.email}</div>
          <div className="text-xs capitalize text-muted-foreground">{role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const sideLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
  )

export function AppShell() {
  const { canWrite } = useOrg()
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r bg-muted/30 p-4 md:flex">
        <div className="flex items-center gap-2 px-1 text-sm font-semibold">
          <Building2Icon className="size-5" aria-hidden /> Property Ledger
        </div>
        <OrgSwitcher />
        {canWrite && (
          <NavLink to="/new" className={buttonVariants({ className: 'w-full' })}>
            <PlusIcon /> New entry
          </NavLink>
        )}
        <nav aria-label="Main" className="grid gap-1">
          {sidebarNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={sideLink}>
              <Icon className="size-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <div className="min-w-0 flex-1 md:hidden">
            <OrgSwitcher />
          </div>
          <div className="hidden flex-1 md:block" />
          <UserMenu />
        </header>
        <main className="flex-1 px-4 pt-4 pb-24 md:px-8 md:pt-6 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Main"
        data-testid="bottom-nav"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {bottomNav
          .filter((i) => canWrite || !i.primary)
          .map(({ to, label, icon: Icon, primary }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-xs',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {primary ? (
                <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                  <Icon className="size-6" aria-hidden />
                </span>
              ) : (
                <Icon className="size-5" aria-hidden />
              )}
              {label}
            </NavLink>
          ))}
      </nav>
    </div>
  )
}
