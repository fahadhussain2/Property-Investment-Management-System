import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, NativeSelect } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { ACCOUNT_TYPES, CATEGORY_KINDS } from '@/lib/labels'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AccountRowActions } from './AccountRowActions'
import { accountKeys, addCategoryAccount, categorySchema, fetchAccounts } from './api'

/** All heads of account, grouped. Users add income/expense heads; system heads are fixed. */
export function ChartOfAccountsPage() {
  const { current, canWrite } = useOrg()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })

  return (
    <>
      <Link to="/settings" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> Settings
      </Link>
      <PageHeader
        title="Chart of accounts"
        description="The heads your entries are recorded under. Add your own income and expense heads."
        actions={
          canWrite && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Add head
            </Button>
          )
        }
      />
      {accounts.isPending ? (
        <SectionLoading />
      ) : accounts.isError ? (
        <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {ACCOUNT_TYPES.map((t) => (
            <section key={t.value} aria-labelledby={`coa-${t.value}`}>
              <h2 id={`coa-${t.value}`} className="mb-2 text-sm font-semibold text-muted-foreground">
                {t.label}
              </h2>
              <ul className="divide-y rounded-lg border" data-testid={`coa-${t.value}`}>
                {accounts.data
                  .filter((a) => a.type === t.value)
                  .map((a) => (
                    <li key={a.id} className={cn('flex items-center gap-3 px-4 py-2', !a.is_active && 'text-muted-foreground')}>
                      <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{a.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {a.name} {a.system_key && <Badge variant="outline">System</Badge>}{' '}
                        {!a.is_active && <Badge variant="outline">Hidden</Badge>}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{formatMoney(a.balance, current.currency)}</span>
                      {canWrite && <AccountRowActions account={a} />}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add a head of account"
        submitLabel="Add head"
        schema={categorySchema}
        onSubmit={async ({ kind, name }) => {
          await addCategoryAccount(current.id, kind, name)
          await queryClient.invalidateQueries({ queryKey: accountKeys.all(current.id) })
          toast.success(`${name} added`)
        }}
      >
        {(errors) => (
          <>
            <Field label="Kind" name="kind" error={errors.kind}>
              <NativeSelect id="field-kind" name="kind" defaultValue="property_expense">
                {CATEGORY_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Name" name="name" placeholder="Generator fuel" error={errors.name} />
          </>
        )}
      </FormDialog>
    </>
  )
}
