import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/Field'
import { friendlyError, parseForm, type FieldErrors } from '@/lib/forms'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { loginSchema } from './schema'

export function LoginPage() {
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { data, errors } = parseForm(loginSchema, e.currentTarget)
    if (!data) return setErrors(errors)
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword(data)
    setBusy(false)
    if (error) return setErrors({ form: friendlyError(error) })
    navigate(from, { replace: true })
  }

  return (
    <AuthLayout title="Sign in" description="Welcome back. Sign in to your books.">
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4" noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
        />
        <Link to="/forgot-password" className="-mt-2 justify-self-end text-sm text-muted-foreground underline-offset-4 hover:underline">
          Forgot password?
        </Link>
        {errors.form && (
          <p role="alert" className="text-sm text-destructive">
            {errors.form}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
