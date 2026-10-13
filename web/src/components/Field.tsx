import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type FieldProps = {
  label: string
  name: string
  error?: string
  hint?: ReactNode
  children?: ReactNode
} & ComponentProps<typeof Input>

/** A password input with an eye button that shows or hides what is typed (off by default, per field). */
function PasswordInput({ id, ...props }: ComponentProps<typeof Input>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input id={id} {...props} type={shown ? 'text' : 'password'} className={cn('pr-9', props.className)} />
      <button
        type="button"
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {shown ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
        {/* Visible text, not aria-label: getByLabel('Password') must keep finding only the input. */}
        <span className="sr-only">{shown ? 'Hide password' : 'Show password'}</span>
      </button>
    </div>
  )
}

/** Label + input (or custom control as children) + hint/error, wired for accessibility. Password fields get the eye toggle. */
export function Field({ label, name, error, hint, children, className, ...inputProps }: FieldProps) {
  const id = `field-${name}`
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    // content-start: in a row of fields, a neighbour's hint or error makes the row taller; without it this
    // grid would stretch its label and control rows to fill that height and the control would drop out of line.
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children ??
        (inputProps.type === 'password' ? (
          <PasswordInput id={id} name={name} aria-invalid={!!error} aria-describedby={describedBy} {...inputProps} />
        ) : (
          <Input id={id} name={name} aria-invalid={!!error} aria-describedby={describedBy} {...inputProps} />
        ))}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Native <select>: gives the phone's own picker on mobile. Styled like Input. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        // Same height, radius, padding and dark fill as Input, so selects and inputs line up side by side.
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
