import { BookOpenIcon, ChevronRightIcon, ScaleIcon } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { useOrg } from '@/features/org/OrgProvider'
import { ENTRY_TYPES, GROUPS } from './types'

const row = 'flex items-center gap-3 px-4 py-3 hover:bg-accent'

/** "+ New": what happened, in plain words. Each opens the matching entry form. */
export function NewEntryPage() {
  const { canWrite } = useOrg()
  if (!canWrite) return <Navigate to="/entries" replace />
  return (
    <>
      <PageHeader title="New entry" description="What happened? Pick the closest match." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.key} aria-labelledby={`group-${g.key}`}>
            <h2 id={`group-${g.key}`} className="mb-2 text-sm font-semibold text-muted-foreground">
              {g.label}
            </h2>
            <ul className="divide-y rounded-lg border">
              {ENTRY_TYPES.filter((e) => e.group === g.key).map((e) => (
                <li key={e.type}>
                  <Link to={`/new/${e.type}`} className={row}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{e.action}</span>
                      <span className="block truncate text-sm text-muted-foreground">{e.help}</span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section aria-labelledby="group-setup">
          <h2 id="group-setup" className="mb-2 text-sm font-semibold text-muted-foreground">
            Setup &amp; corrections
          </h2>
          <ul className="divide-y rounded-lg border">
            <li>
              <Link to="/new/opening" className={row}>
                <BookOpenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Opening balances</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    Starting from your registers: cash, bank, properties held, money owed
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
            <li>
              <Link to="/new/journal" className={row}>
                <ScaleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Journal entry (advanced)</span>
                  <span className="block truncate text-sm text-muted-foreground">Debits and credits, for your accountant</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </>
  )
}
