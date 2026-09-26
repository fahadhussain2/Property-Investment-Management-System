import { CheckCircle2Icon, DownloadIcon, PrinterIcon, XCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field, NativeSelect } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { useOrg } from '@/features/org/OrgProvider'
import { downloadCsv, slug, toCsv, type Cell } from '@/lib/csv'
import { formatMoney, isZero, today, type Money } from '@/lib/money'
import { describePeriod, fiscalYearLabel, presetPeriod, type Period, type PresetKey } from '@/lib/periods'
import { cn } from '@/lib/utils'

/** Period kept in the URL (?period=fy or ?from=…&to=…) so a printed or shared report keeps its dates. */
export function usePeriod(defaultKey: Exclude<PresetKey, 'custom'> = 'fy') {
  const { current } = useOrg()
  const [params, setParams] = useSearchParams()
  const raw = params.get('period')
  const known: PresetKey[] = ['month', 'fy', 'last_fy', 'all']
  const key: PresetKey = raw && known.includes(raw as PresetKey) ? (raw as PresetKey) : params.get('from') ? 'custom' : defaultKey
  const period: Period =
    key === 'custom'
      ? { from: params.get('from') ?? today(), to: params.get('to') ?? today() }
      : presetPeriod(key, today(), current.fiscal_year_start_month)
  // Only touch our own keys: other pages keep theirs (e.g. the ledger's ?account=).
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const k of ['period', 'from', 'to']) next.delete(k)
    for (const [k, v] of Object.entries(values)) next.set(k, v)
    setParams(next, { replace: true })
  }
  const setKey = (k: PresetKey) => update(k === 'custom' ? { from: period.from, to: period.to } : { period: k })
  const setCustom = (p: Period) => update({ from: p.from, to: p.to })
  return { key, period, setKey, setCustom }
}

export function PeriodPicker({ state }: { state: ReturnType<typeof usePeriod> }) {
  const { current } = useOrg()
  const fy = presetPeriod('fy', today(), current.fiscal_year_start_month)
  const lastFy = presetPeriod('last_fy', today(), current.fiscal_year_start_month)
  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <Field label="Period" name="period">
        <NativeSelect id="field-period" value={state.key} onChange={(e) => state.setKey(e.target.value as PresetKey)} className="w-48">
          <option value="month">This month</option>
          <option value="fy">This year ({fiscalYearLabel(fy)})</option>
          <option value="last_fy">Last year ({fiscalYearLabel(lastFy)})</option>
          <option value="all">All time</option>
          <option value="custom">Custom dates…</option>
        </NativeSelect>
      </Field>
      {state.key === 'custom' && (
        <>
          <Field label="From" name="from" type="date" value={state.period.from} onChange={(e) => e.target.value && state.setCustom({ ...state.period, from: e.target.value })} className="w-40" />
          <Field label="To" name="to" type="date" value={state.period.to} onChange={(e) => e.target.value && state.setCustom({ ...state.period, to: e.target.value })} className="w-40" />
        </>
      )}
    </div>
  )
}

/** As-of date kept in the URL (?asOf=YYYY-MM-DD), default today. */
export function useAsOf() {
  const [params, setParams] = useSearchParams()
  const asOf = params.get('asOf') ?? today()
  const setAsOf = (d: string) => {
    const next = new URLSearchParams(params)
    next.set('asOf', d)
    setParams(next, { replace: true })
  }
  return { asOf, setAsOf }
}

export function AsOfPicker({ state }: { state: ReturnType<typeof useAsOf> }) {
  return (
    <div className="print:hidden">
      <Field label="As at" name="asOf" type="date" value={state.asOf} onChange={(e) => e.target.value && state.setAsOf(e.target.value)} className="w-44" />
    </div>
  )
}

export type CsvSpec = { name: string; headers: string[]; rows: Cell[][] }

/** Frame for every report: title, controls, Print and CSV, and a header that only appears on paper. */
export function ReportShell({
  title,
  subtitle,
  description,
  controls,
  csv,
  children,
}: {
  title: string
  /** Period or as-of text, shown on screen and on paper. */
  subtitle: string
  description?: ReactNode
  controls?: ReactNode
  csv?: CsvSpec
  children: ReactNode
}) {
  const { current } = useOrg()
  return (
    <>
      <div className="hidden print:mb-4 print:block">
        <div className="text-sm">{current.name}</div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="text-sm">
          {subtitle} · Printed {new Date().toLocaleString()}
        </div>
      </div>
      <div className="print:hidden">
        <PageHeader
          title={title}
          description={description ?? subtitle}
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <PrinterIcon /> Print
              </Button>
              {csv && (
                <Button
                  variant="outline"
                  onClick={() => downloadCsv(`${slug(current.name)}-${slug(csv.name)}.csv`, toCsv(csv.headers, csv.rows))}
                >
                  <DownloadIcon /> CSV
                </Button>
              )}
            </>
          }
        />
      </div>
      {controls && <div className="mb-4">{controls}</div>}
      {children}
    </>
  )
}

/** Green "Balanced" or red "Difference Rs X": every report that must reconcile says so. */
export function ReconcileBanner({ difference, currency }: { difference: Money; currency: string }) {
  const ok = isZero(difference)
  const Icon = ok ? CheckCircle2Icon : XCircleIcon
  return (
    <div
      data-testid="reconcile"
      className={cn(
        'mb-4 flex items-center gap-2 rounded-lg p-3 text-sm font-medium',
        ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {ok ? 'Balanced' : `Difference ${formatMoney(difference, currency)}: please tell your administrator`}
    </div>
  )
}

export { describePeriod }
