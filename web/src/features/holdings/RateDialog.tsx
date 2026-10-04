import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Field } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { useOrg } from '@/features/org/OrgProvider'
import { formatMoney, today } from '@/lib/money'
import { holdingKeys, setRate } from './api'
import { rateSchema } from './schema'
import { formatDate } from '@/lib/dates'

/** Today's rate for one tola of pure gold (24K) or pure silver. A second rate on the same day replaces the first. */
export function RateDialog({
  open,
  onOpenChange,
  metal,
  current: latest,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  metal: 'gold' | 'silver'
  current?: { rate_per_tola: string; rate_date: string } | null
}) {
  const { current } = useOrg()
  const qc = useQueryClient()
  const pure = metal === 'gold' ? 'pure gold (24K)' : 'pure silver'
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Set today's ${metal} rate`}
      description={
        latest
          ? `Last rate: ${formatMoney(latest.rate_per_tola, current.currency)} per tola on ${formatDate(latest.rate_date)}. Values use the purity of each item.`
          : 'Values use the purity of each item. The books stay at cost: the rate only shows what things are worth.'
      }
      submitLabel="Save rate"
      schema={rateSchema}
      onSubmit={async (input) => {
        await setRate(current.id, metal, input)
        await qc.invalidateQueries({ queryKey: holdingKeys.all(current.id) })
        toast.success(`${metal === 'gold' ? 'Gold' : 'Silver'} rate saved`)
      }}
    >
      {(errors) => (
        <>
          <Field label={`Rate per tola of ${pure} (${current.currency})`} name="rate_per_tola" inputMode="decimal" placeholder="250,000" error={errors.rate_per_tola} />
          <Field label="Date" name="rate_date" type="date" defaultValue={today()} max="2100-12-31" error={errors.rate_date} />
        </>
      )}
    </FormDialog>
  )
}
