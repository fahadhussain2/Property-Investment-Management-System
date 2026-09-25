import { createBrowserRouter } from 'react-router-dom'
import { ComingSoon } from '@/components/ComingSoon'
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ChartOfAccountsPage } from '@/features/accounts/ChartOfAccountsPage'
import { MoneyAccountsPage } from '@/features/accounts/MoneyAccountsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MembersPage } from '@/features/members/MembersPage'
import { OnboardingPage } from '@/features/org/OnboardingPage'
import { OrgProvider } from '@/features/org/OrgProvider'
import { PartiesPage } from '@/features/parties/PartiesPage'
import { PartyPage } from '@/features/parties/PartyPage'
import { PropertiesPage } from '@/features/properties/PropertiesPage'
import { PropertyPage } from '@/features/properties/PropertyPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AppShell } from './AppShell'
import { MorePage } from './MorePage'
import { RouteError } from './RouteError'

export const router = createBrowserRouter([
  { path: '/login', element: <RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>, errorElement: <RouteError /> },
  { path: '/signup', element: <RedirectIfSignedIn><SignupPage /></RedirectIfSignedIn>, errorElement: <RouteError /> },
  { path: '/onboarding', element: <RequireAuth><OnboardingPage /></RequireAuth>, errorElement: <RouteError /> },
  {
    path: '/',
    errorElement: <RouteError />,
    element: (
      <RequireAuth>
        <OrgProvider>
          <AppShell />
        </OrgProvider>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'properties', element: <PropertiesPage /> },
      { path: 'properties/:id', element: <PropertyPage /> },
      { path: 'parties', element: <PartiesPage /> },
      { path: 'parties/:id', element: <PartyPage /> },
      { path: 'new', element: <ComingSoon title="New entry" milestone="M4" /> },
      { path: 'money', element: <ComingSoon title="Cash & Bank" milestone="M5" /> },
      { path: 'reports', element: <ComingSoon title="Reports" milestone="M5" /> },
      { path: 'leases', element: <ComingSoon title="Leases & Rent" milestone="M6" /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/members', element: <MembersPage /> },
      { path: 'settings/accounts', element: <ChartOfAccountsPage /> },
      { path: 'settings/accounts/money', element: <MoneyAccountsPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <ComingSoon title="Page not found" milestone="no milestone. Check the address" /> },
    ],
  },
])
