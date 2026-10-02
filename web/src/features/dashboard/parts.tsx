import {
  Building2Icon,
  CalendarClockIcon,
  CarIcon,
  ChevronRightIcon,
  CoinsIcon,
  GemIcon,
  LandmarkIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SectionError } from '@/components/QueryState'
import { cn } from '@/lib/utils'
import type { QueryLike, TileIcon, TileLook, TileTone } from './model'
import { AnimateContext, useAnimateIn } from './motion'

/** A dashboard block: a card with a title, an optional link or action, and its own loading/error state. */
export function Block({
  title,
  icon: Icon,
  description,
  link,
  action,
  className,
  children,
  testid,
}: {
  title: string
  /** A plain muted icon before the title (spec 005 §4): no square, no colour. */
  icon?: LucideIcon
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
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            {title}
          </h2>
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
    <Link
      to={to}
      className={cn('inline-flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline', className)}
    >
      {children} <ChevronRightIcon className="size-4" aria-hidden />
    </Link>
  )
}

/** Grey placeholder the size of the content it stands for, so the layout does not jump. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-muted', className)} />
}

/** Layout of a block's body (its parent's flex column, gap and all). Tiles pass their own. */
const BLOCK_BODY = 'flex min-w-0 flex-1 flex-col gap-4'

/**
 * Renders `children(data)` once loaded; a skeleton while loading; SectionError (never a made-up
 * zero) when it failed.
 *
 * Spec 005 §5: when the content replaces a skeleton it fades in and rises a little (delayed by the
 * inherited `--i`, a tile's position), and descendants can ask `useAnimateIn()` whether to grow their
 * bars. Content that was already cached when the block mounted just appears.
 */
export function Loaded<T>({
  query,
  skeleton,
  className = BLOCK_BODY,
  children,
}: {
  query: QueryLike<T>
  skeleton: ReactNode
  className?: string
  children: (data: T) => ReactNode
}) {
  const [animate] = useState(query.isPending)
  if (query.isPending) return <div role="status" aria-label="Loading">{skeleton}</div>
  // relative z-10: stays clickable above a tile's stretched link.
  if (query.isError)
    return (
      <div className="relative z-10">
        <SectionError error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  return (
    <div data-animate={animate || undefined} className={cn(className, animate && 'motion-safe:animate-dash-in')}>
      <AnimateContext value={animate}>{children(query.data as T)}</AnimateContext>
    </div>
  )
}

/** A horizontal bar showing a share (0–100) of the largest value in its list. */
export function ShareBar({ pct, color }: { pct: number; color: string }) {
  const animate = useAnimateIn()
  return (
    <div aria-hidden className="h-2 rounded-full bg-muted">
      <div
        className={cn('h-full origin-left rounded-full', animate && 'motion-safe:animate-dash-grow')}
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

/**
 * A row of figures under a small heading. The heading names the row for screen readers too (the page
 * keeps one h1). Key figures put `TileGrid` inside; What we own puts one `AssetCard`.
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
      {children}
    </section>
  )
}

/** 2 columns on phones and tablets, 4 on desktop. */
export const TileGrid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>

const ICONS: Record<TileIcon, LucideIcon> = {
  wallet: WalletIcon,
  'trending-up': TrendingUpIcon,
  'trending-down': TrendingDownIcon,
  landmark: LandmarkIcon,
  'calendar-clock': CalendarClockIcon,
  alert: TriangleAlertIcon,
  building: Building2Icon,
  car: CarIcon,
  gem: GemIcon,
  coins: CoinsIcon,
}

// Colour lives only here (spec 005 §3): a soft tint of the tone with the icon in full colour, a little
// stronger in dark mode so it does not fade out. Tones come from the validated --chart-* palette.
const TONES: Record<TileTone, string> = {
  blue: 'bg-chart-1/12 text-chart-1 dark:bg-chart-1/20',
  green: 'bg-chart-3/12 text-chart-3 dark:bg-chart-3/20',
  amber: 'bg-chart-4/15 text-chart-4 dark:bg-chart-4/20',
  red: 'bg-red-600/10 text-red-600 dark:bg-red-400/15 dark:text-red-400',
  neutral: 'bg-muted text-muted-foreground',
}

export function IconChip({ look, small }: { look: TileLook; small?: boolean }) {
  const Icon = ICONS[look.icon]
  return (
    <span
      aria-hidden
      data-icon={look.icon}
      data-tone={look.tone}
      className={cn('inline-flex shrink-0 items-center justify-center', small ? 'size-6 rounded-md' : 'size-8 rounded-lg', TONES[look.tone])}
    >
      <Icon className={small ? 'size-3.5' : 'size-4'} />
    </span>
  )
}

// A thin strip along the top of each key-figure tile, in its icon's tone (spec 005 §4, amendment 1). The
// tile's overflow-hidden clips it, so it follows the rounded corners.
const STRIPES: Record<TileTone, string> = {
  blue: 'before:bg-chart-1',
  green: 'before:bg-chart-3',
  amber: 'before:bg-chart-4',
  red: 'before:bg-red-600 dark:before:bg-red-400',
  neutral: 'before:bg-muted-foreground/30',
}

/** `--i` (position in the row) staggers the entrance of what `Loaded` shows inside. */
const stagger = (index: number) => ({ '--i': index }) as CSSProperties

/** Body layout for `Loaded` inside a tile or section: value and sub-line stacked. */
export const TILE_BODY = 'flex min-w-0 flex-col gap-1'

/**
 * A tile is a plain box whose label is a link stretched over the whole tile (after:absolute).
 * Not a <Link> around everything: a "Try again" button inside a link is invalid and would navigate.
 */
export function Tile({
  label,
  to,
  look,
  index = 0,
  alert,
  testid,
  children,
}: {
  label: ReactNode
  to: string
  look: TileLook
  index?: number
  alert?: boolean
  testid?: string
  children: ReactNode
}) {
  return (
    <div
      data-testid={testid}
      style={stagger(index)}
      className={cn(
        'relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors has-[a:hover]:bg-accent/50',
        'before:absolute before:inset-x-0 before:top-0 before:h-0.5',
        STRIPES[look.tone],
      )}
    >
      <Link
        to={to}
        className={cn(
          'flex min-w-0 items-center gap-2.5 text-sm font-medium text-muted-foreground after:absolute after:inset-0 after:rounded-xl',
          alert && 'text-red-700 dark:text-red-400',
        )}
      >
        <IconChip look={look} />
        <span className="min-w-0">{label}</span>
      </Link>
      {children}
    </div>
  )
}

/** One card split into sections with thin dividers: 2 × 2 on phones and tablets, 4 across on desktop. */
export const AssetCard = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:grid-cols-4">{children}</div>
)

/** A compact section of `AssetCard`; like `Tile`, its label is a link stretched over the section. */
export function AssetSection({
  label,
  to,
  look,
  index = 0,
  testid,
  children,
}: {
  label: string
  to: string
  look: TileLook
  index?: number
  testid?: string
  children: ReactNode
}) {
  return (
    <div
      data-testid={testid}
      style={stagger(index)}
      className={cn(
        'relative flex min-w-0 flex-col gap-2 p-3 transition-colors has-[a:hover]:bg-accent/50 sm:px-4',
        'border-foreground/10 even:border-l nth-[n+3]:border-t lg:not-first:border-l lg:nth-[n+3]:border-t-0',
      )}
    >
      <Link to={to} className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground after:absolute after:inset-0">
        <IconChip look={look} small />
        <span className="min-w-0">{label}</span>
      </Link>
      {children}
    </div>
  )
}

export const Value = ({
  children,
  testid,
  negative,
  muted,
  compact,
}: {
  children: ReactNode
  testid?: string
  negative?: boolean
  muted?: boolean
  compact?: boolean
}) => (
  <span
    data-testid={testid}
    className={cn(
      'leading-tight font-semibold tabular-nums [overflow-wrap:anywhere]',
      compact ? 'text-base sm:text-lg' : 'text-lg sm:text-2xl',
      negative && 'text-red-700 dark:text-red-400',
      muted && 'font-medium text-muted-foreground',
    )}
  >
    {children}
  </span>
)

export const Sub = ({ children, compact }: { children: ReactNode; compact?: boolean }) => (
  <span className={cn('text-xs text-muted-foreground', !compact && 'sm:text-sm')}>{children}</span>
)

export const TileSkeleton = ({ compact }: { compact?: boolean }) => <Skeleton className={compact ? 'h-10' : 'h-12'} />
