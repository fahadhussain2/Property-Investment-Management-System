import { CircleCheckIcon } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { daysLabel, formatDate, type Attention, type AttentionTab } from './model'
import { MoreLink } from './parts'

const TABS: { id: AttentionTab; label: string; short: string; more: { to: string; label: string } }[] = [
  { id: 'overdue', label: 'Rent overdue', short: 'Overdue', more: { to: '/leases', label: 'Rent roll' } },
  { id: 'ending', label: 'Leases ending', short: 'Ending', more: { to: '/leases?show=ending', label: 'All leases ending' } },
  { id: 'to_pay', label: 'To pay', short: 'To pay', more: { to: '/reports/parties', label: 'Party balances' } },
]

function Row({ to, title, detail, value, tone }: { to: string; title: ReactNode; detail: ReactNode; value: ReactNode; tone?: 'critical' | 'warning' }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-accent/50">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="truncate text-xs text-muted-foreground">{detail}</span>
        </span>
        <span
          className={cn(
            'shrink-0 text-sm font-semibold tabular-nums',
            tone === 'critical' && 'text-red-700 dark:text-red-400',
            tone === 'warning' && 'text-amber-700 dark:text-amber-400',
          )}
        >
          {value}
        </span>
      </Link>
    </li>
  )
}

/** The body of the "Needs attention" block: accessible tabs over three short lists. */
export function NeedsAttention({ data, currency }: { data: Attention; currency: string }) {
  const [tab, setTab] = useState<AttentionTab>(data.defaultTab)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const m = (x: string) => formatMoney(x, currency)
  const count = { overdue: data.overdue.count, ending: data.ending.count, to_pay: data.toPay.count }

  if (data.total === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" data-testid="needs-attention">
        <CircleCheckIcon className="size-4 text-emerald-600" aria-hidden /> Nothing needs attention
      </p>
    )
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next].id)
    refs.current[next]?.focus()
  }
  const active = TABS.find((t) => t.id === tab)!

  return (
    <div className="flex flex-1 flex-col gap-2" data-testid="needs-attention">
      <div role="tablist" aria-label="Needs attention" className="flex border-b" onKeyDown={onKeyDown}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`attention-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="attention-panel"
            aria-label={`${t.label} (${count[t.id]})`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px min-h-11 flex-1 border-b-2 border-transparent px-1 text-sm font-medium whitespace-nowrap text-muted-foreground',
              tab === t.id && 'border-foreground text-foreground',
            )}
          >
            {t.short}{' '}
            <span className={cn('ml-0.5 rounded-full px-1.5 text-xs tabular-nums', count[t.id] > 0 ? 'bg-muted text-foreground' : 'text-muted-foreground')}>{count[t.id]}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="attention-panel" aria-labelledby={`attention-tab-${tab}`} className="flex flex-1 flex-col">
        {count[tab] === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <ul className="divide-y" data-testid={tab === 'ending' ? 'expiring-leases' : tab === 'overdue' ? 'overdue-rent' : 'to-pay'}>
            {tab === 'overdue' &&
              data.overdue.rows.map((r) => (
                <Row
                  key={r.lease_id}
                  to={`/leases/${r.lease_id}`}
                  title={`${r.property_code} · ${r.tenant_name}`}
                  detail={`${r.months_unpaid} ${r.months_unpaid === 1 ? 'month' : 'months'} unpaid · ${
                    r.last_rent_date ? `last paid ${formatDate(r.last_rent_date)}` : 'nothing received yet'
                  }`}
                  value={m(r.arrears)}
                  tone="critical"
                />
              ))}
            {tab === 'ending' &&
              data.ending.rows.map((l) => (
                <Row
                  key={l.lease_id}
                  to={`/leases/${l.lease_id}`}
                  title={`${l.property_code} · ${l.tenant_name}`}
                  detail={`Ends ${formatDate(l.end_date)}`}
                  value={daysLabel(l.days_to_end)}
                  tone={l.days_to_end <= 30 ? 'warning' : undefined}
                />
              ))}
            {tab === 'to_pay' &&
              data.toPay.rows.map((p) => (
                <Row key={p.party_id} to={`/parties/${p.party_id}`} title={p.name} detail="Balance owed on purchases" value={m(p.payable)} />
              ))}
          </ul>
        )}
        <MoreLink to={active.more.to} className="mt-auto self-start pt-2">
          {count[tab] > 5 ? `View all ${count[tab]}` : active.more.label}
        </MoreLink>
      </div>
    </div>
  )
}
