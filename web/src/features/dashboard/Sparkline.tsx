import { toChartNumber, type Money } from '@/lib/money'

/** Decorative trend line (the tile's text carries the value), so it is hidden from screen readers. */
export function Polyline({ values }: { values: Money[] }) {
  if (values.length < 2) return null
  const ys = values.map(toChartNumber)
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  const span = hi - lo || 1
  const points = ys.map((y, i) => `${((i / (ys.length - 1)) * 100).toFixed(1)},${(26 - ((y - lo) / span) * 24).toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden className="h-6 w-20 shrink-0 overflow-visible">
      <polyline points={points} fill="none" stroke="var(--chart-income)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
