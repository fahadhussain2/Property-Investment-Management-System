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
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { AccountRowActions } from './AccountRowActions'
import { accountKeys, addMoneyAccount, fetchAccounts, moneyAccountSchema } from './api'

export function MoneyAccountsPage() {
  const { current, canWrite } = useOrg()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const accounts = useQuery({ queryKey: accountKeys.all(current.id), queryFn: () => fetchAccounts(current.id) })
  const money = (accounts.data ?? []).filter((a) => a.subtype === 'cash' || a.subtype === 'bank')

  return (
    <>
      <Link to="/settings" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden /> Settings
      </Link>
      <PageHeader
        title="Bank & cash accounts"
        description="Where your money is kept. Every payment and receipt goes through one of these."
        actions={
          canWrite && (
            <Button onClick={() => setAdding(true)}>
              <PlusIcon /> Add account
            </Button>
          )
        }
      />
      {accounts.isPending ? (
        <SectionLoading />
      ) : accounts.isError ? (
        <SectionError error={accounts.error} onRetry={() => accounts.refetch()} />
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="money-accounts">
          {money.map((a) => (
            <li key={a.id} className={cn('flex items-center gap-3 px-4 py-3', !a.is_active && 'text-muted-foreground')}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {a.name} {!a.is_active && <Badge variant="outline">Hidden</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {a.subtype === 'bank' ? 'Bank' : 'Cash'} · {a.code}
                  {a.bank_name ? ` · ${a.bank_name}` : ''}
                  {a.bank_account_no ? ` · A/c ${a.bank_account_no}` : ''}
                </div>
              </div>
              <div className="shrink-0 text-right tabular-nums">{formatMoney(a.balance, current.currency)}</div>
              {canWrite && <AccountRowActions account={a} />}
            </li>
          ))}
        </ul>
      )}
      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add a bank or cash account"
        description="Its balance starts at zero. Record the money already in it as an opening balance."
        submitLabel="Add account"
        schema={moneyAccountSchema}
        onSubmit={async (input) => {
          await addMoneyAccount(current.id, input)
          await queryClient.invalidateQueries({ queryKey: accountKeys.all(current.id) })
          await queryClient.invalidateQueries({ queryKey: ['account-balances', current.id] })
          toast.success(`${input.name} added`)
        }}
      >
        {(errors) => (
          <>
            <Field label="Kind" name="kind" error={errors.kind}>
              <NativeSelect id="field-kind" name="kind" defaultValue="bank">
                <option value="bank">Bank account</option>
                <option value="cash">Cash (e.g. petty cash, site cash)</option>
              </NativeSelect>
            </Field>
            <Field label="Name" name="name" placeholder="Meezan Current" error={errors.name} />
            <Field label="Bank (optional)" name="bank_name" placeholder="Meezan Bank" error={errors.bank_name} />
            <Field
              label="Account number (optional)"
              name="account_no"
              hint="Last 4 digits are enough"
              error={errors.account_no}
            />
          </>
        )}
      </FormDialog>
    </>
  )
}
