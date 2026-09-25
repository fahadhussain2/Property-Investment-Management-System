import {
  BarChart3Icon,
  BookOpenTextIcon,
  Building2Icon,
  FileSignatureIcon,
  HomeIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon }

/** Desktop sidebar, in order. */
export const sidebarNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: HomeIcon },
  { to: '/entries', label: 'Entries', icon: BookOpenTextIcon },
  { to: '/properties', label: 'Properties', icon: Building2Icon },
  { to: '/money', label: 'Cash & Bank', icon: WalletIcon },
  { to: '/leases', label: 'Leases & Rent', icon: FileSignatureIcon },
  { to: '/parties', label: 'Parties', icon: UsersIcon },
  { to: '/reports', label: 'Reports', icon: BarChart3Icon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

/** Mobile bottom tabs: the centre "+ New" is the primary action. */
export const bottomNav: (NavItem & { primary?: boolean })[] = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/properties', label: 'Properties', icon: Building2Icon },
  { to: '/new', label: 'New', icon: PlusIcon, primary: true },
  { to: '/money', label: 'Money', icon: WalletIcon },
  { to: '/more', label: 'More', icon: MenuIcon },
]

/** Items reachable from the mobile "More" page. */
export const moreNav: NavItem[] = sidebarNav.filter((i) =>
  ['/entries', '/leases', '/parties', '/reports', '/settings'].includes(i.to),
)
