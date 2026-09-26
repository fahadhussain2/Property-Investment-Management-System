import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MoneyTable, td, tdNum, th, thNum } from '@/components/MoneyTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { ReportShell } from '@/components/ReportShell'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney, isNegative, isZero, sub, sum, toMoney } from '@/lib/money'
import { fetchPartyBalances, reportKeys } from './api'

/** Who owes us, and whom we owe, right now. */
export function PartyBalancesPage() {
  const { current } = useOrg()
  const [showAll, setShowAll] = useState(false)
  const q = useQuery({ queryKey: [...reportKeys.all(current.id), 'party-balances'], queryFn: () => fetchPartyBalances(current.id) })
  const m = (x: string) => (isZero(x) ? '' : formatMoney(x, current.currency))
  const all = (q.data ?? []).map((p) => ({
    ...p,
    receivable: toMoney(p.receivable),
    payable: toMoney(p.payable),
    advances: toMoney(p.advances),
    deposits: toMoney(p.deposits),
    net: toMoney(p.net),
  }))
  const rows = showAll ? all : all.filter((p) => !isZero(p.receivable) || !isZero(p.payable) || !isZero(p.advances) || !isZero(p.deposits))
  const owedToUs = sum(all.map((p) => p.receivable))
  const weOwe = sum(all.map((p) => sum([p.payable, p.advances, p.deposits])))

  return (
    <ReportShell
      title="Who owes whom"
      subtitle="Balances today"
      description={
        q.data
          ? `Others owe you ${formatMoney(owedToUs, current.currency)} · You owe others ${formatMoney(weOwe, current.currency)}`
          : 'Balances today'
      }
      controls={
        <label className="flex items-center gap-2 text-sm print:hidden">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-primary" />
          Show parties with nothing outstanding
        </label>
      }
      csv={q.data && {
        name: 'party-balances',
        headers: ['Party', 'They owe us', 'We owe them', 'Token money held', 'Deposits held', 'Net (+ they owe us)'],
        rows: rows.map((p) => [p.name, p.receivable, p.payable, p.advances, p.deposits, p.net]),
      }}
    >
      {q.isPending ? (
        <SectionLoading />
      ) : q.isError ? (
        <SectionError error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing outstanding with anyone.</p>
      ) : (
        <MoneyTable testid="party-balances" minWidth="44rem">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Party</th>
              <th className={thNum}>They owe us</th>
              <th className={thNum}>We owe them</th>
              <th className={thNum}>Token money held</th>
              <th className={thNum}>Deposits held</th>
              <th className={thNum}>Net</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => (
              <tr key={p.party_id}>
                <td className={td}>
                  <Link to={`/parties/${p.party_id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className={tdNum}>{m(p.receivable)}</td>
                <td className={tdNum}>{m(p.payable)}</td>
                <td className={tdNum}>{m(p.advances)}</td>
                <td className={tdNum}>{m(p.deposits)}</td>
                <td className={tdNum}>
                  {isZero(p.net)
                    ? 'Settled'
                    : isNegative(p.net)
                      ? `We owe ${formatMoney(sub('0.00', p.net), current.currency)}`
                      : `Owes us ${formatMoney(p.net, current.currency)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </MoneyTable>
      )}
    </ReportShell>
  )
}
