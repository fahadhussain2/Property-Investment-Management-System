import {
  BarChart3Icon,
  BookMarkedIcon,
  BookOpenTextIcon,
  Building2Icon,
  CarIcon,
  CoinsIcon,
  GemIcon,
  FileSignatureIcon,
  FolderOpenIcon,
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
  { to: '/vehicles', label: 'Vehicles', icon: CarIcon },
  { to: '/gold', label: 'Gold', icon: CoinsIcon },
  { to: '/silver', label: 'Silver', icon: GemIcon },
  { to: '/money', label: 'Cash & Bank', icon: WalletIcon },
  { to: '/leases', label: 'Leases & Rent', icon: FileSignatureIcon },
  { to: '/parties', label: 'Parties', icon: UsersIcon },
  { to: '/documents', label: 'Documents', icon: FolderOpenIcon },
  { to: '/registers', label: 'Registers', icon: BookMarkedIcon },
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
  ['/entries', '/vehicles', '/gold', '/silver', '/leases', '/parties', '/documents', '/registers', '/reports', '/settings'].includes(i.to),
)
