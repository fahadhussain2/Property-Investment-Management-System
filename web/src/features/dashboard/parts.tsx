import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SectionError } from '@/components/QueryState'
import { cn } from '@/lib/utils'
import type { QueryLike } from './model'

/** A dashboard block: a card with a title, an optional link or action, and its own loading/error state. */
export function Block({
  title,
  description,
  link,
  action,
  className,
  children,
  testid,
}: {
  title: string
  description?: ReactNode
  link?: { to: string; label: string }
  action?: ReactNode
  className?: string
  children: ReactNode
  testid?: string
}) {
  return (
    <section
      aria-label={title}
      data-testid={testid}
      className={cn('flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10 sm:p-5', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
        {link && <MoreLink to={link.to}>{link.label}</MoreLink>}
      </div>
      {children}
    </section>
  )
}

export function MoreLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground hover:underline', className)}>
      {children} <ChevronRightIcon className="size-4" aria-hidden />
    </Link>
  )
}

/** Grey placeholder the size of the content it stands for, so the layout does not jump. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-muted', className)} />
}

/**
 * Renders `children(data)` once loaded; a skeleton while loading; SectionError (never a made-up
 * zero) when it failed.
 */
export function Loaded<T>({
  query,
  skeleton,
  children,
}: {
  query: QueryLike<T>
  skeleton: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <div role="status" aria-label="Loading">{skeleton}</div>
  // relative z-10: stays clickable above a tile's stretched link.
  if (query.isError)
    return (
      <div className="relative z-10">
        <SectionError error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  return <>{children(query.data as T)}</>
}

/** A horizontal bar showing a share (0–100) of the largest value in its list. */
export function ShareBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div aria-hidden className="h-2 rounded-full bg-muted">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
