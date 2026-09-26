import { BookOpenIcon, Building2Icon, ChevronRightIcon, HandCoinsIcon, ScaleIcon, TrendingUpIcon, WalletIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'

const REPORTS = [
  { to: '/reports/income-statement', icon: TrendingUpIcon, title: 'Income statement', help: 'Profit for a period: trading profit, rent by property, other income, expenses' },
  { to: '/reports/properties', icon: Building2Icon, title: 'Property profitability', help: 'Each property’s cost, rent, expenses, sale and net profit' },
  { to: '/reports/parties', icon: HandCoinsIcon, title: 'Who owes whom', help: 'Money others owe you and money you owe, by party' },
  { to: '/money', icon: WalletIcon, title: 'Cash book & bank books', help: 'Every movement of money, with running balances' },
  { to: '/reports/balance-sheet', icon: ScaleIcon, title: 'Balance sheet', help: 'What the business owns and owes on a date' },
  { to: '/reports/trial-balance', icon: ScaleIcon, title: 'Trial balance', help: 'All account balances; debits equal credits' },
  { to: '/reports/ledger', icon: BookOpenIcon, title: 'Account ledger', help: 'Every entry in any one account' },
]

export function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Print any report, or download it as CSV for Excel." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORTS.map(({ to, icon: Icon, title, help }) => (
          <li key={to}>
            <Link to={to} className="flex h-full items-start gap-3 rounded-lg border p-4 hover:bg-accent">
              <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">{help}</span>
              </span>
              <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
