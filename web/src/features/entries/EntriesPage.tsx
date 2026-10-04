import { useQuery } from '@tanstack/react-query'
import { PlusIcon, ReceiptTextIcon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { Field, NativeSelect } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { fetchParties, partyKeys } from '@/features/parties/api'
import { fetchPropertySummaries, propertyKeys } from '@/features/properties/api'
import { VOUCHER_TYPES, type VoucherType } from '@/lib/labels'
import { formatMoney, toMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { entryKeys, fetchEntries, type EntryFilters } from './api'
import { formatDate } from '@/lib/dates'

/** The day book: every entry, newest first. */
export function EntriesPage() {
  const { current, canWrite } = useOrg()
  const [filters, setFilters] = useState<EntryFilters>({ type: 'all' })
  const [q, setQ] = useState('')
  const list = useQuery({
    queryKey: [...entryKeys.all(current.id), filters],
    queryFn: () => fetchEntries(current.id, filters),
  })
  const properties = useQuery({
    queryKey: propertyKeys.all(current.id),
    queryFn: () => fetchPropertySummaries(current.id),
  })
  const parties = useQuery({
    queryKey: partyKeys.all(current.id),
    queryFn: () => fetchParties(current.id),
  })

  const propCode = useMemo(
    () => new Map((properties.data ?? []).map((p) => [p.property_id, p.code])),
    [properties.data],
  )
  const partyName = useMemo(
    () => new Map((parties.data ?? []).map((p) => [p.id, p.name])),
    [parties.data],
  )
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (list.data ?? []).filter(
      (v) =>
        !needle ||
        v.number.toLowerCase().includes(needle) ||
        (v.memo ?? '').toLowerCase().includes(needle) ||
        (propCode.get(v.property_id ?? '') ?? '').toLowerCase().includes(needle) ||
        (partyName.get(v.party_id ?? '') ?? '').toLowerCase().includes(needle),
    )
  }, [list.data, q, propCode, partyName])

  return (
    <>
      <PageHeader
        title="Entries"
        description="Your day book: everything recorded, newest first"
        actions={
          canWrite && (
            <Link to="/new" className={buttonVariants()}>
              <PlusIcon /> New entry
            </Link>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="relative col-span-2">
          <SearchIcon
            className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            aria-label="Search entries"
            placeholder="Number, note, property or party"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <NativeSelect
          aria-label="Entry type"
          className="col-span-2"
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value as VoucherType | 'all' })}
        >
          <option value="all">All types</option>
          {Object.entries(VOUCHER_TYPES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <Field
          label="From"
          name="from"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })}
        />
        <Field
          label="To"
          name="to"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })}
        />
      </div>

      {list.isPending ? (
        <SectionLoading label="Loading entries…" />
      ) : list.isError ? (
        <SectionError error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ReceiptTextIcon}
          title={list.data.length ? 'No entries match' : 'No entries yet'}
        >
          {!list.data.length &&
            canWrite &&
            'Start with your opening balances, then record what happens day to day.'}
        </EmptyState>
      ) : (
        <>
          {list.data.length >= 500 && (
            <p className="mb-2 text-sm text-muted-foreground">
              Showing the latest 500 entries. Use the dates to see older ones.
            </p>
          )}
          <ul className="divide-y rounded-lg border" data-testid="entries-list">
            {rows.map((v) => {
              const cancelled = v.status === 'reversed' || v.reverses_id !== null
              const who = [propCode.get(v.property_id ?? ''), partyName.get(v.party_id ?? '')]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={v.id}>
                  <Link
                    to={`/entries/${v.id}`}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 text-sm hover:bg-accent',
                      cancelled && 'text-muted-foreground',
                    )}
                  >
                    <span className="w-24 shrink-0 tabular-nums">
                      {formatDate(v.date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block font-medium', cancelled && 'line-through')}>
                        {VOUCHER_TYPES[v.type]}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[v.number, who, v.memo].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className={cn('shrink-0 tabular-nums', cancelled && 'line-through')}>
                      {formatMoney(toMoney(v.amount), current.currency)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
