import { useQuery } from '@tanstack/react-query'
import { LedgerTable, ledgerCsv, type LedgerRow } from '@/components/LedgerTable'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { downloadCsv, slug, toCsv } from '@/lib/csv'
import { Button } from '@/components/ui/button'
import { DownloadIcon, PrinterIcon } from 'lucide-react'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchPartyBalances, fetchPartyLedger, reportKeys } from '@/features/reports/api'
import { formatMoney, isNegative, isZero, sub, toMoney } from '@/lib/money'
import { ALL_TIME } from '@/lib/periods'

const COLS: [string, string] = ['They owe more', 'We owe more']

/** What stands between us and this party, and every entry that got it there. */
export function PartyStatement({ partyId, partyName }: { partyId: string; partyName: string }) {
  const { current } = useOrg()
  const balances = useQuery({
    queryKey: [...reportKeys.all(current.id), 'party-balances'],
    queryFn: () => fetchPartyBalances(current.id),
  })
  const ledger = useQuery({
    queryKey: [...reportKeys.all(current.id), 'party-ledger', partyId],
    queryFn: () => fetchPartyLedger(current.id, partyId, ALL_TIME),
  })
  const m = (x: string) => formatMoney(x, current.currency)
  const b = balances.data?.find((p) => p.party_id === partyId)
  const net = toMoney(b?.net)
  const rows = (ledger.data ?? []) as LedgerRow[]
  const chips = b
    ? [
        ['They owe us', toMoney(b.receivable)],
        ['We owe them', toMoney(b.payable)],
        ['Token money we hold', toMoney(b.advances)],
        ['Deposit we hold', toMoney(b.deposits)],
      ].filter(([, v]) => !isZero(v))
    : []
  return (
    <section className="grid grid-cols-1 gap-3">
      {/* On paper the party page prints only this statement (PartyPage hides the rest), under this header. */}
      <div className="hidden print:block">
        <div className="text-sm">{current.name}</div>
        <h1 className="text-xl font-semibold">Statement · {partyName}</h1>
        <div className="text-sm">All entries · Printed {new Date().toLocaleString()}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 className="text-sm font-semibold text-muted-foreground">Balance &amp; statement</h2>
        {ledger.data && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const spec = ledgerCsv(`statement-${partyName}`, rows, COLS)
                downloadCsv(
                  `${slug(current.name)}-${slug(spec.name)}.csv`,
                  toCsv(spec.headers, spec.rows),
                )
              }}
            >
              <DownloadIcon /> CSV
            </Button>
          </div>
        )}
      </div>
      {balances.isPending ? (
        <SectionLoading label="Loading balance…" />
      ) : balances.isError ? (
        <SectionError error={balances.error} onRetry={() => balances.refetch()} />
      ) : (
        <div className="rounded-lg border p-3 text-sm" data-testid="party-net">
          <span className="font-semibold">
            {isZero(net)
              ? 'Settled: nothing outstanding'
              : isNegative(net)
                ? `We owe ${partyName} ${m(sub('0.00', net))}`
                : `${partyName} owes us ${m(net)}`}
          </span>
          {chips.length > 0 && (
            <span className="mt-1 block text-muted-foreground">
              {chips.map(([k, v]) => `${k}: ${m(v)}`).join(' · ')}
            </span>
          )}
        </div>
      )}
      {ledger.isPending ? (
        <SectionLoading />
      ) : ledger.isError ? (
        <SectionError error={ledger.error} onRetry={() => ledger.refetch()} />
      ) : (
        <>
          <LedgerTable
            rows={rows}
            currency={current.currency}
            columns={COLS}
            testid="party-statement"
          />
          <p className="text-xs text-muted-foreground">
            Balance: positive means they owe us; negative means we owe them.
          </p>
        </>
      )}
    </section>
  )
}
