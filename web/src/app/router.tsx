import { createBrowserRouter } from 'react-router-dom'
import { ComingSoon } from '@/components/ComingSoon'
import { RedirectIfSignedIn, RequireAuth } from '@/features/auth/guards'
import { RequireWrite } from '@/features/auth/RequireWrite'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ChartOfAccountsPage } from '@/features/accounts/ChartOfAccountsPage'
import { MoneyAccountsPage } from '@/features/accounts/MoneyAccountsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { EntriesPage } from '@/features/entries/EntriesPage'
import { HoldingPage } from '@/features/holdings/HoldingPage'
import { HoldingsPage } from '@/features/holdings/HoldingsPage'
import { EntryFormPage } from '@/features/entries/EntryFormPage'
import { EntryPage } from '@/features/entries/EntryPage'
import { JournalPage } from '@/features/entries/JournalPage'
import { NewEntryPage } from '@/features/entries/NewEntryPage'
import { OpeningBalancesPage } from '@/features/entries/OpeningBalancesPage'
import { LeasePage } from '@/features/leases/LeasePage'
import { LeasesPage } from '@/features/leases/LeasesPage'
import { MembersPage } from '@/features/members/MembersPage'
import { MoneyBookPage } from '@/features/money/MoneyBookPage'
import { MoneyPage } from '@/features/money/MoneyPage'
import { BalanceSheetPage } from '@/features/reports/BalanceSheetPage'
import { HoldingsReportPage } from '@/features/reports/HoldingsReportPage'
import { IncomeStatementPage } from '@/features/reports/IncomeStatementPage'
import { LedgerPage } from '@/features/reports/LedgerPage'
import { PartyBalancesPage } from '@/features/reports/PartyBalancesPage'
import { PropertyProfitabilityPage } from '@/features/reports/PropertyProfitabilityPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { TrialBalancePage } from '@/features/reports/TrialBalancePage'
import { OnboardingPage } from '@/features/org/OnboardingPage'
import { OrgProvider } from '@/features/org/OrgProvider'
import { PartiesPage } from '@/features/parties/PartiesPage'
import { PartyPage } from '@/features/parties/PartyPage'
import { DocumentsPage } from '@/features/documents/DocumentsPage'
import { PropertiesPage } from '@/features/properties/PropertiesPage'
import { PropertyPage } from '@/features/properties/PropertyPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AppShell } from './AppShell'
import { MorePage } from './MorePage'
import { RouteError } from './RouteError'

export const router = createBrowserRouter([
  { path: '/login', element: <RedirectIfSignedIn><LoginPage /></RedirectIfSignedIn>, errorElement: <RouteError /> },
  { path: '/signup', element: <RedirectIfSignedIn><SignupPage /></RedirectIfSignedIn>, errorElement: <RouteError /> },
  { path: '/forgot-password', element: <RedirectIfSignedIn><ForgotPasswordPage /></RedirectIfSignedIn>, errorElement: <RouteError /> },
  // Not behind RedirectIfSignedIn: the reset link itself signs the user in (a recovery session).
  { path: '/reset-password', element: <ResetPasswordPage />, errorElement: <RouteError /> },
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
      // One register component per class; the key resets its filters when moving between them.
      { path: 'vehicles', element: <HoldingsPage key="vehicle" cls="vehicle" /> },
      { path: 'vehicles/:id', element: <HoldingPage key="vehicle" cls="vehicle" /> },
      { path: 'gold', element: <HoldingsPage key="gold" cls="gold" /> },
      { path: 'gold/:id', element: <HoldingPage key="gold" cls="gold" /> },
      { path: 'silver', element: <HoldingsPage key="silver" cls="silver" /> },
      { path: 'silver/:id', element: <HoldingPage key="silver" cls="silver" /> },
      { path: 'parties', element: <PartiesPage /> },
      { path: 'parties/:id', element: <PartyPage /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'new', element: <RequireWrite><NewEntryPage /></RequireWrite> },
      { path: 'new/opening', element: <RequireWrite><OpeningBalancesPage /></RequireWrite> },
      { path: 'new/journal', element: <RequireWrite><JournalPage /></RequireWrite> },
      { path: 'new/:type', element: <RequireWrite><EntryFormPage /></RequireWrite> },
      { path: 'entries', element: <EntriesPage /> },
      { path: 'entries/:id', element: <EntryPage /> },
      { path: 'entries/:id/edit', element: <RequireWrite><EntryFormPage /></RequireWrite> },
      { path: 'money', element: <MoneyPage /> },
      { path: 'money/:accountId', element: <MoneyBookPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'reports/income-statement', element: <IncomeStatementPage /> },
      { path: 'reports/balance-sheet', element: <BalanceSheetPage /> },
      { path: 'reports/trial-balance', element: <TrialBalancePage /> },
      { path: 'reports/properties', element: <PropertyProfitabilityPage /> },
      { path: 'reports/parties', element: <PartyBalancesPage /> },
      { path: 'reports/holdings', element: <HoldingsReportPage /> },
      { path: 'reports/ledger', element: <LedgerPage /> },
      { path: 'leases', element: <LeasesPage /> },
      { path: 'leases/:id', element: <LeasePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/members', element: <MembersPage /> },
      { path: 'settings/accounts', element: <ChartOfAccountsPage /> },
      { path: 'settings/accounts/money', element: <MoneyAccountsPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <ComingSoon title="Page not found" milestone="no milestone. Check the address" /> },
    ],
  },
])
