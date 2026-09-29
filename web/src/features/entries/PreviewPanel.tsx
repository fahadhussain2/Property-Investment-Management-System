import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import { formatMoney, isNegative } from '@/lib/money'
import { formatWeight } from '@/lib/quantity'
import { cn } from '@/lib/utils'
import type { PreviewLine } from './api'

/** The accounting behind an entry, for whoever wants to check it. Table on wider screens, list on phones. */
export function LinesTable({ lines, currency }: { lines: PreviewLine[]; currency: string }) {
  const m = (x: string) => (x === '0.00' ? '' : formatMoney(x, currency))
  // Weight moved by a gold/silver line, signed like the line: + in (debit), − out (credit).
  const weight = (l: PreviewLine) =>
    l.quantity_g && l.quantity_g !== '0' ? `${l.quantity_g.startsWith('-') ? '−' : '+'}${formatWeight(l.quantity_g.replace('-', ''), 'g')}` : null
  const tags = (l: PreviewLine) => {
    const t = [l.property_code, l.holding_code, weight(l), l.party_name].filter(Boolean)
    return t.length > 0 && <span className="block text-xs text-muted-foreground">{t.join(' · ')}</span>
  }
  return (
    <div data-testid="entry-lines">
      <ul className="divide-y rounded-md border text-sm sm:hidden">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="text-muted-foreground tabular-nums">{l.code}</span> {l.name}
              {tags(l)}
            </span>
            <span className="shrink-0 text-right whitespace-nowrap tabular-nums">
              {l.debit !== '0.00' ? `Dr ${m(l.debit)}` : `Cr ${m(l.credit)}`}
            </span>
          </li>
        ))}
      </ul>
      <table className="hidden w-full rounded-md border text-sm sm:table">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">Account</th>
            <th className="px-3 py-1.5 text-right font-medium">Debit</th>
            <th className="px-3 py-1.5 text-right font-medium">Credit</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="px-3 py-1.5">
                <span className="text-muted-foreground tabular-nums">{l.code}</span> {l.name}
                {tags(l)}
              </td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{m(l.debit)}</td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{m(l.credit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProfitBanner({
  profit,
  cost,
  costLabel = 'Total cost of the property',
  currency,
}: {
  profit: string
  cost?: string
  costLabel?: string
  currency: string
}) {
  const loss = isNegative(profit)
  const Icon = loss ? TrendingDownIcon : TrendingUpIcon
  return (
    <div
      data-testid="sale-profit"
      className={cn(
        'flex items-center gap-3 rounded-lg p-4',
        loss
          ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200'
          : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
      )}
    >
      <Icon className="size-6 shrink-0" aria-hidden />
      <div>
        <div className="text-lg font-semibold">
          {loss ? 'Loss' : 'Profit'} on this sale:{' '}
          <span className="whitespace-nowrap">{formatMoney(loss ? profit.replace('-', '') : profit, currency)}</span>
        </div>
        {cost && (
          <div className="text-sm opacity-80">
            {costLabel}: <span className="whitespace-nowrap">{formatMoney(cost, currency)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function PreviewPanel({
  summary,
  number,
  lines,
  profit,
  cost,
  costLabel,
  currency,
}: {
  summary: string
  number: string
  lines: PreviewLine[]
  profit?: string
  cost?: string
  costLabel?: string
  currency: string
}) {
  return (
    <div className="grid grid-cols-1 gap-4" data-testid="entry-preview">
      <p className="text-base" data-testid="entry-summary">
        {summary}
      </p>
      {profit !== undefined && <ProfitBanner profit={profit} cost={cost} costLabel={costLabel} currency={currency} />}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Accounting entries (will be {number})</summary>
        <div className="mt-2">
          <LinesTable lines={lines} currency={currency} />
        </div>
      </details>
    </div>
  )
}
