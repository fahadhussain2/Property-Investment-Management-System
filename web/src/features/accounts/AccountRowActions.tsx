import { useQueryClient } from '@tanstack/react-query'
import { EyeIcon, EyeOffIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { useOrg } from '@/features/org/OrgProvider'
import { friendlyError } from '@/lib/forms'
import { accountKeys, renameSchema, updateAccount, type AccountWithBalance } from './api'

/** Rename + hide/unhide. System accounts can only be renamed (enforced by the DB too). */
export function AccountRowActions({ account }: { account: AccountWithBalance }) {
  const { current } = useOrg()
  const queryClient = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKeys.all(current.id) }),
      queryClient.invalidateQueries({ queryKey: ['account-balances', current.id] }),
    ])

  async function toggleActive() {
    try {
      await updateAccount(current.id, account.id, { is_active: !account.is_active })
      await refresh()
      toast.success(account.is_active ? `${account.name} hidden` : `${account.name} shown again`)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="icon" aria-label={`Rename ${account.name}`} onClick={() => setRenaming(true)}>
        <PencilIcon />
      </Button>
      {!account.system_key && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={account.is_active ? `Hide ${account.name}` : `Unhide ${account.name}`}
          onClick={toggleActive}
        >
          {account.is_active ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      )}
      <FormDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={`Rename ${account.code}`}
        submitLabel="Save"
        schema={renameSchema}
        onSubmit={async ({ name }) => {
          await updateAccount(current.id, account.id, { name })
          await refresh()
          toast.success('Renamed')
        }}
      >
        {(errors) => <Field label="Name" name="name" defaultValue={account.name} error={errors.name} />}
      </FormDialog>
    </div>
  )
}
