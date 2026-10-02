// Loaded with React.lazy so only the dashboard pays for Recharts.
import { useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { formatMoney } from '@/lib/money'
import { axisFor, compactTick, type ChartPoint } from './model'
import { useAnimateIn, usePrefersReducedMotion } from './motion'

const config = {
  income: { label: 'Income', color: 'var(--chart-income)' },
  expenses: { label: 'Expenses', color: 'var(--chart-expense)' },
  profit: { label: 'Net profit', color: 'var(--chart-profit)' },
} satisfies ChartConfig

/** Spec 005 §5: bars grow and the line draws once, on the first draw after the skeleton. */
const GROW_MS = 500

export default function PerformanceChart({
  points,
  currency,
  drawnBefore,
  onDrawn,
}: {
  points: ChartPoint[]
  currency: string
  drawnBefore: boolean
  onDrawn: () => void
}) {
  const axis = axisFor(points)
  const animateIn = useAnimateIn()
  const reduce = usePrefersReducedMotion()
  const [animate, setAnimate] = useState(() => animateIn && !reduce && !drawnBefore)
  useEffect(() => {
    onDrawn()
    if (!animate) return
    // Later data (a range switch) redraws without animation.
    const t = setTimeout(() => setAnimate(false), GROW_MS + 100)
    return () => clearTimeout(t)
  }, [animate, onDrawn])
  const motion = { isAnimationActive: animate && !reduce, animationDuration: GROW_MS, animationEasing: 'ease-out' as const }
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full" data-testid="performance-chart">
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%" accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={4} />
        <YAxis
          width={44}
          tickLine={false}
          axisLine={false}
          domain={[axis.min, axis.max]}
          ticks={axis.ticks}
          tickFormatter={compactTick}
        />
        {axis.min < 0 && <ReferenceLine y={0} stroke="var(--border)" />}
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.7 }}
          content={({ active, payload }) =>
            active && payload?.length ? <MonthTip point={payload[0].payload as ChartPoint} currency={currency} /> : null
          }
        />
        <Bar dataKey="income_y" name="Income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={28} {...motion} />
        <Bar dataKey="expenses_y" name="Expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} maxBarSize={28} {...motion} />
        <Line
          dataKey="profit_y"
          name="Net profit"
          type="linear"
          stroke="var(--color-profit)"
          strokeWidth={2}
          dot={{ r: 4, fill: 'var(--color-profit)', stroke: 'var(--card)', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: 'var(--color-profit)', stroke: 'var(--card)', strokeWidth: 2 }}
          {...motion}
        />
      </ComposedChart>
    </ChartContainer>
  )
}

/** Full amounts, formatted from the Money strings (never from the chart's numbers). */
function MonthTip({ point, currency }: { point: ChartPoint; currency: string }) {
  const m = (x: string) => formatMoney(x, currency)
  const row = (label: string, color: string, value: string) => (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
  return (
    <div className="grid min-w-52 gap-1.5 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <div className="font-medium">{point.longLabel}</div>
      {row('Income', 'var(--chart-income)', m(point.total_income))}
      {row('Expenses', 'var(--chart-expense)', m(point.total_expenses))}
      <div className="flex items-center justify-between gap-6 border-t pt-1.5 font-medium">
        <span>Net profit</span>
        <span className="tabular-nums">{m(point.net_profit)}</span>
      </div>
    </div>
  )
}
