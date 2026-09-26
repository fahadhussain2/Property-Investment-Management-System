import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field, NativeSelect } from '@/components/Field'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { useAuth } from '@/features/auth/AuthProvider'
import { friendlyError, parseForm, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { createOrganization } from './api'
import { saveCurrentOrg } from './current'
import { MONTHS, onboardingSchema } from './schema'

/** Shown to signed-in users who do not belong to any business yet. */
export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  // Given at sign-up; with email confirmation on, the business is created here after the first sign-in.
  const suggestedName = String(useAuth().session?.user.user_metadata?.business_name ?? '')

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { data, errors } = parseForm(onboardingSchema, e.currentTarget)
    if (!data) return setErrors(errors)
    setBusy(true)
    try {
      saveCurrentOrg(await createOrganization(data))
      // refetchType 'all': the list is not on screen right now, but must be fresh before we navigate.
      await queryClient.invalidateQueries({ queryKey: ['my-orgs'], refetchType: 'all' })
      navigate('/', { replace: true })
    } catch (err) {
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Set up your business"
      description="Waiting for an invitation instead? Ask the owner to invite this email, then sign in again."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
        <Field label="Business name" name="name" autoComplete="organization" defaultValue={suggestedName} error={errors.name} />
        <Field
          label="Currency"
          name="currency"
          defaultValue="PKR"
          maxLength={3}
          className="max-w-32"
          error={errors.currency}
        />
        <Field label="Financial year starts in" name="fiscalYearStartMonth" error={errors.fiscalYearStartMonth}>
          <NativeSelect id="field-fiscalYearStartMonth" name="fiscalYearStartMonth" defaultValue="7">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create business'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </form>
    </AuthLayout>
  )
}
