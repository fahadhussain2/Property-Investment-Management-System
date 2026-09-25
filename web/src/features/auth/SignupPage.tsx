import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/Field'
import { createOrganization } from '@/features/org/api'
import { saveCurrentOrg } from '@/features/org/current'
import { friendlyError, parseForm, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { signupSchema } from './schema'

export function SignupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const invitedEmail = params.get('email') ?? ''
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { data, errors } = parseForm(signupSchema, e.currentTarget)
    if (!data) return setErrors(errors)
    setBusy(true)
    try {
      const { data: auth, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      })
      if (error) throw error
      // Email confirmation is on (production): the business is created after the first sign-in.
      if (!auth.session) return setCheckEmail(true)
      if (data.businessName) {
        const orgId = await createOrganization({
          name: data.businessName,
          currency: 'PKR',
          fiscalYearStartMonth: 7,
        })
        saveCurrentOrg(orgId)
      }
      // refetchType 'all': the list is not on screen right now, but must be fresh before we navigate.
      await queryClient.invalidateQueries({ queryKey: ['my-orgs'], refetchType: 'all' })
      navigate('/', { replace: true })
    } catch (err) {
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  if (checkEmail) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link. Open it, then{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            sign in
          </Link>
          .
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={invitedEmail ? 'Join your team' : 'Create your account'}
      description={
        invitedEmail
          ? 'You were invited. Choose a password to join.'
          : 'Replace your paper registers in a few minutes.'
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        {!invitedEmail && (
          <Field
            label="Business name"
            name="businessName"
            autoComplete="organization"
            placeholder="e.g. Hussain Estates"
            error={errors.businessName}
          />
        )}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={invitedEmail}
          readOnly={!!invitedEmail}
          error={errors.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          error={errors.password}
        />
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
