import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/Field'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { friendlyError, parseForm, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { resetPasswordSchema } from './schema'

/**
 * Landing page of the reset link. supabase-js signs the user in from the link (a recovery session);
 * without one the link was expired, already used, or opened in another browser.
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  if (loading) return <FullPageSpinner />
  if (!session) {
    return (
      <AuthLayout title="This link has expired">
        <p className="text-sm text-muted-foreground">
          Reset links work once and only for a short time.{' '}
          <Link to="/forgot-password" className="font-medium text-foreground underline underline-offset-4">
            Send a new link
          </Link>
          .
        </p>
      </AuthLayout>
    )
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { data, errors } = parseForm(resetPasswordSchema, e.currentTarget)
    if (!data) return setErrors(errors)
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: data.password })
    setBusy(false)
    if (error) return setErrors({ form: friendlyError(error) })
    toast.success('Password changed')
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout title="Choose a new password" description={session.user.email}>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters"
          error={errors.password}
        />
        <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} />
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
