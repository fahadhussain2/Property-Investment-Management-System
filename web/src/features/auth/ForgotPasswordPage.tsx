import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/Field'
import { friendlyError, parseForm, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { forgotPasswordSchema } from './schema'

/** Sends a password reset link. The same message is shown whether or not the email has an account. */
export function ForgotPasswordPage() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { data, errors } = parseForm(forgotPasswordSchema, e.currentTarget)
    if (!data) return setErrors(errors)
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) return setErrors({ form: friendlyError(error) })
    setSentTo(data.email)
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{sentTo}</span> has an account, we sent it a link to choose a
          new password. The link works once.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="font-medium underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot your password?" description="Enter your email and we’ll send you a link to choose a new one.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
