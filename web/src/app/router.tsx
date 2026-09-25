import { createBrowserRouter } from 'react-router-dom'
import { ComingSoon } from '@/components/ComingSoon'
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/guards'
import { RequireWrite } from '@/features/auth/RequireWrite'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ChartOfAccountsPage } from '@/features/accounts/ChartOfAccountsPage'
import { MoneyAccountsPage } from '@/features/accounts/MoneyAccountsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { EntriesPage } from '@/features/entries/EntriesPage'
import { EntryFormPage } from '@/features/entries/EntryFormPage'
import { EntryPage } from '@/features/entries/EntryPage'
import { JournalPage } from '@/features/entries/JournalPage'
import { NewEntryPage } from '@/features/entries/NewEntryPage'
import { OpeningBalancesPage } from '@/features/entries/OpeningBalancesPage'
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
      { path: 'new', element: <RequireWrite><NewEntryPage /></RequireWrite> },
      { path: 'new/opening', element: <RequireWrite><OpeningBalancesPage /></RequireWrite> },
      { path: 'new/journal', element: <RequireWrite><JournalPage /></RequireWrite> },
      { path: 'new/:type', element: <RequireWrite><EntryFormPage /></RequireWrite> },
      { path: 'entries', element: <EntriesPage /> },
      { path: 'entries/:id', element: <EntryPage /> },
      { path: 'entries/:id/edit', element: <RequireWrite><EntryFormPage /></RequireWrite> },
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
