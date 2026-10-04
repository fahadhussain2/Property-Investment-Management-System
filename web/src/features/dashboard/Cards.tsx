import { LandmarkIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { VOUCHER_TYPES } from '@/lib/labels'
import { formatMoney, isNegative, toMoney, type Money } from '@/lib/money'
import { cn } from '@/lib/utils'
import { portfolioLabel, type CashAccount, type MixRow, type Portfolio } from './model'
import { useAnimateIn } from './motion'
import { MoreLink, ShareBar } from './parts'
import { formatDate } from '@/lib/dates'

const Amount = ({ value, currency, testid, className }: { value: Money; currency: string; testid?: string; className?: string }) => (
  <span data-testid={testid} className={cn('font-semibold tabular-nums', isNegative(value) && 'text-red-700 dark:text-red-400', className)}>
    {formatMoney(value, currency)}
  </span>
)

// ---------------------------------------------------------------------------------------------

function CountLink({ to, testid, swatch, label, count }: { to: string; testid: string; swatch?: string; label: string; count: number }) {
  return (
    <Link to={to} data-testid={testid} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent/50">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-[3px]"
        style={swatch ? { background: swatch } : { boxShadow: 'inset 0 0 0 1.5px var(--muted-foreground)' }}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="font-semibold tabular-nums">{count}</span>
    </Link>
  )
}

export function PortfolioBody({ data }: { data: Portfolio }) {
  const animate = useAnimateIn()
  if (data.held === 0 && data.sold === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No properties yet.{' '}
        <Link to="/new/purchase" className="underline">
          Bought a property
        </Link>
      </p>
    )
  }
  return (
    <>
      <p className="-mt-2 text-sm text-muted-foreground">
        {data.held} held · {data.sold} sold
      </p>
      <div
        role="img"
        aria-label={portfolioLabel(data)}
        className={cn('flex h-3 origin-left gap-0.5', animate && 'motion-safe:animate-dash-grow')}
      >
        {data.held === 0 ? (
          <div className="flex-1 rounded-full bg-muted" />
        ) : (
          data.segments
            .filter((s) => s.count > 0)
            .map((s) => <div key={s.key} className="rounded-[4px]" style={{ flex: `${s.count} 1 0`, background: s.color }} />)
        )}
      </div>
      {/* As many columns as fit at 11rem each, so labels never truncate. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-2">
        {data.segments.map((s) => (
          <CountLink key={s.key} to={`/properties?status=${s.key}`} testid={`portfolio-${s.key}`} swatch={s.color} label={s.label} count={s.count} />
        ))}
        <CountLink to="/properties?status=for_sale" testid="portfolio-for_sale" label="Listed for sale" count={data.forSale} />
        <CountLink to="/properties?status=sold" testid="portfolio-sold" label="Sold" count={data.sold} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------

export function ProfitMixBody({ rows, net, currency }: { rows: MixRow[]; net: Money; currency: string }) {
  return (
    <>
      <ul className="grid grid-cols-1 gap-3">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-1 gap-1.5">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              {r.key === 'expenses' ? (
                <span className="font-semibold tabular-nums">({formatMoney(r.amount, currency)})</span>
              ) : (
                <Amount value={r.amount} currency={currency} />
              )}
            </div>
            <ShareBar pct={r.pct} color={r.tone === 'expense' ? 'var(--chart-expense)' : 'var(--chart-income)'} />
          </li>
        ))}
      </ul>
      <div className="mt-auto flex justify-between border-t pt-3 text-sm font-semibold">
        <span>Net profit</span>
        <Amount value={net} currency={currency} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------

export function CashAccountsBody({ rows, total, hasBank, currency }: { rows: CashAccount[]; total: Money; hasBank: boolean; currency: string }) {
  return (
    <>
      {!hasBank && (
        <Link to="/settings/accounts/money" className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm hover:bg-accent/50">
          <LandmarkIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            <span className="font-medium">Add your bank accounts</span>
            <span className="block text-muted-foreground">So payments and receipts can be recorded against them.</span>
          </span>
        </Link>
      )}
      <ul className="grid grid-cols-1 gap-3">
        {rows.map((a) => (
          <li key={a.account_id}>
            <Link to={`/money/${a.account_id}`} data-testid={`balance-${a.code}`} className="grid grid-cols-1 gap-1.5 rounded-md hover:bg-accent/50">
              <span className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{a.name}</span> <span className="text-muted-foreground">· {a.kind}</span>
                </span>
                <Amount value={a.balance} currency={currency} />
              </span>
              <ShareBar pct={a.pct} color="var(--chart-income)" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex justify-between border-t pt-3 text-sm font-semibold">
        <span>Total</span>
        <Amount value={total} currency={currency} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------------------------

export function OwedBody({
  data,
  currency,
}: {
  data: { owedToUs: Money; weOwe: Money; sellers: Money; tokens: Money; deposits: Money }
  currency: string
}) {
  const m = (x: Money) => formatMoney(x, currency)
  const figure = (label: string, value: Money, testid: string, note: ReactNode) => (
    <div className="grid grid-cols-1 gap-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Amount value={value} currency={currency} testid={testid} className="text-xl" />
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  )
  return (
    <div className="grid grid-cols-1 gap-4">
      {figure('Others owe you', data.owedToUs, 'owed-to-us', 'Balance due from buyers')}
      <div className="border-t pt-4">
        {figure(
          'You owe others',
          data.weOwe,
          'we-owe',
          `Sellers ${m(data.sellers)} · Token money ${m(data.tokens)} · Deposits held ${m(data.deposits)}`,
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

type Entry = { id: string; date: string; type: string; number: string; amount: number | string; property_id: string | null }

export function LatestEntriesBody({
  entries,
  codes,
  currency,
}: {
  entries: Entry[]
  codes: Map<string, string>
  currency: string
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing recorded yet. Start with{' '}
        <Link to="/new/opening" className="underline">
          opening balances
        </Link>
        .
      </p>
    )
  }
  const type = (t: string) => VOUCHER_TYPES[t as keyof typeof VOUCHER_TYPES] ?? t
  const code = (id: string | null) => (id && codes.get(id)) || '—'
  return (
    <div data-testid="recent-entries">
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Entry</th>
            <th className="py-2 pr-3 font-medium">Property</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((v) => (
            <tr key={v.id} className="border-b last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(v.date)}</td>
              <td className="py-2 pr-3">
                <Link to={`/entries/${v.id}`} className="hover:underline">
                  {type(v.type)}
                </Link>{' '}
                <span className="text-muted-foreground">· {v.number}</span>
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{code(v.property_id)}</td>
              <td className="py-2 text-right whitespace-nowrap">
                <Amount value={toMoney(v.amount)} currency={currency} className="font-medium" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y sm:hidden">
        {entries.map((v) => (
          <li key={v.id}>
            <Link to={`/entries/${v.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {type(v.type)}
                  {v.property_id ? ` · ${code(v.property_id)}` : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(v.date)} · {v.number}
                </span>
              </span>
              <Amount value={toMoney(v.amount)} currency={currency} className="shrink-0 font-medium" />
            </Link>
          </li>
        ))}
      </ul>
      <MoreLink to="/entries" className="mt-2">
        Day book
      </MoreLink>
    </div>
  )
}
