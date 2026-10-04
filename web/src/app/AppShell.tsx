import { Building2Icon, LogOutIcon, MoonIcon, PlusIcon, SunIcon, UserIcon } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NativeSelect } from '@/components/Field'
import { useAuth } from '@/features/auth/AuthProvider'
import { useOrg } from '@/features/org/OrgProvider'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
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

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      aria-label="Dark theme"
      aria-pressed={dark}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
      className={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      {dark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
    </button>
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
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-medium">{session?.user.email}</div>
            <div className="text-xs capitalize text-muted-foreground">{role}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A new page starts at the top: the window keeps its scroll position across client-side navigation, so a page
 * opened from the bottom of a long one used to open part-way down. Only when the path changes: a filter or
 * period kept in the URL (same path) leaves you where you are. Back and Forward (POP) are left alone.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  const type = useNavigationType()
  const last = useRef(pathname)
  useLayoutEffect(() => {
    if (last.current === pathname) return
    last.current = pathname
    if (type !== 'POP') window.scrollTo(0, 0)
  }, [pathname, type])
  return null
}

const sideLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
  )

export function AppShell() {
  const { canWrite } = useOrg()
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[15rem_minmax(0,1fr)] print:block">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh print:!hidden flex-col gap-4 border-r bg-muted/30 p-4 md:flex">
        <div className="flex items-center gap-2 px-1 text-sm font-semibold">
          <Building2Icon className="size-5" aria-hidden /> Property Ledger
        </div>
        <OrgSwitcher />
        {canWrite && (
          <NavLink to="/new" className={buttonVariants({ className: 'w-full' })}>
            <PlusIcon /> New entry
          </NavLink>
        )}
        <nav aria-label="Main" className="grid grid-cols-1 gap-1">
          {sidebarNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={sideLink}>
              <Icon className="size-4" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <ScrollToTop />
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-10 flex h-14 print:hidden items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <div className="min-w-0 flex-1 md:hidden">
            <OrgSwitcher />
          </div>
          <div className="hidden flex-1 md:block" />
          <ThemeToggle />
          <UserMenu />
        </header>
        <main className="flex-1 px-4 pt-4 pb-24 md:px-8 md:pt-6 md:pb-8 print:p-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Main"
        data-testid="bottom-nav"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 print:hidden border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
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
