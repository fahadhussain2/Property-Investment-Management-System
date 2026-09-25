import { useState, type FormEvent, type ReactNode } from 'react'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { friendlyError, parseForm, type FieldErrors } from '@/lib/forms'

type FormDialogProps<S extends z.ZodType> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  submitLabel: string
  schema: S
  /** Throw to show the error in the dialog; resolve to close it. */
  onSubmit: (data: z.infer<S>) => Promise<void>
  children: (errors: FieldErrors) => ReactNode
}

/** A dialog with a zod-validated form. Fields use defaultValue; the content remounts each time it opens. */
export function FormDialog<S extends z.ZodType>({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  schema,
  onSubmit,
  children,
}: FormDialogProps<S>) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const result = parseForm(schema, e.currentTarget)
    if (result.errors) return setErrors(result.errors)
    setBusy(true)
    try {
      await onSubmit(result.data)
      setErrors({})
      onOpenChange(false)
    } catch (err) {
      setErrors({ form: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setErrors({})
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4" noValidate>
          {children(errors)}
          {errors.form && (
            <p role="alert" className="text-sm text-destructive">
              {errors.form}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
