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

/**
 * A row of figure tiles under a small heading: 2 columns on phones and tablets, 4 on desktop.
 * The heading names the row for screen readers too (the page keeps one h1).
 */
export function TileRow({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = `tiles-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id={id} className="text-sm font-medium text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  )
}

/**
 * A tile is a plain box whose label is a link stretched over the whole tile (after:absolute).
 * Not a <Link> around everything: a "Try again" button inside a link is invalid and would navigate.
 */
export function Tile({ label, to, alert, testid, children }: { label: ReactNode; to: string; alert?: boolean; testid?: string; children: ReactNode }) {
  return (
    <div
      data-testid={testid}
      className={cn(
        'relative flex min-w-0 flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors has-[a:hover]:bg-accent/50',
        alert && 'ring-2 ring-red-600/70 dark:ring-red-400/70',
      )}
    >
      <Link
        to={to}
        className={cn(
          'flex items-center gap-1.5 text-sm font-medium text-muted-foreground after:absolute after:inset-0 after:rounded-xl',
          alert && 'text-red-700 dark:text-red-400',
        )}
      >
        {label}
      </Link>
      {children}
    </div>
  )
}

export const Value = ({ children, testid, negative, muted }: { children: ReactNode; testid?: string; negative?: boolean; muted?: boolean }) => (
  <span
    data-testid={testid}
    className={cn(
      'text-lg leading-tight font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl',
      negative && 'text-red-700 dark:text-red-400',
      muted && 'font-medium text-muted-foreground',
    )}
  >
    {children}
  </span>
)

export const Sub = ({ children }: { children: ReactNode }) => <span className="text-xs text-muted-foreground sm:text-sm">{children}</span>

export const TileSkeleton = () => <Skeleton className="h-12" />
