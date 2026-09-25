import { AlertTriangleIcon, Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { friendlyError } from '@/lib/forms'

/** Inline loading indicator for a section of a page. */
export function SectionLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  )
}

/**
 * Shown instead of data when a query fails. Never render a fallback number (e.g. Rs 0) in place of
 * data that failed to load: in a finance app a wrong number is worse than no number.
 */
export function SectionError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <AlertTriangleIcon className="size-4 text-destructive" aria-hidden />
      <span className="flex-1">Could not load this. {friendlyError(error)}</span>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
