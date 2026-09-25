import { createBrowserRouter } from 'react-router-dom'
import { ComingSoon } from '@/components/ComingSoon'
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MembersPage } from '@/features/members/MembersPage'
import { OnboardingPage } from '@/features/org/OnboardingPage'
import { OrgProvider } from '@/features/org/OrgProvider'
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
      { path: 'properties', element: <ComingSoon title="Properties" milestone="M3" /> },
      { path: 'parties', element: <ComingSoon title="Parties" milestone="M3" /> },
      { path: 'new', element: <ComingSoon title="New entry" milestone="M4" /> },
      { path: 'money', element: <ComingSoon title="Cash & Bank" milestone="M5" /> },
      { path: 'reports', element: <ComingSoon title="Reports" milestone="M5" /> },
      { path: 'leases', element: <ComingSoon title="Leases & Rent" milestone="M6" /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/members', element: <MembersPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <ComingSoon title="Page not found" milestone="no milestone. Check the address" /> },
    ],
  },
])
