import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Report table: scrolls sideways inside its own box on narrow screens (never the page), and prints
 * at full width. Amount columns are right-aligned and tabular.
 */
export function MoneyTable({ children, testid, minWidth = '36rem' }: { children: ReactNode; testid?: string; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border print:overflow-visible print:border-0">
      <table className="w-full text-sm" style={{ minWidth }} data-testid={testid}>
        {children}
      </table>
    </div>
  )
}

export const th = 'px-3 py-2 text-left font-medium text-muted-foreground'
export const thNum = 'px-3 py-2 text-right font-medium text-muted-foreground'
export const td = 'px-3 py-1.5'
export const tdNum = 'px-3 py-1.5 text-right whitespace-nowrap tabular-nums'

export function Row({ label, amount, strong, indent, testid }: { label: ReactNode; amount: ReactNode; strong?: boolean; indent?: boolean; testid?: string }) {
  return (
    <tr className={cn(strong && 'border-t font-semibold')} data-testid={testid}>
      <td className={cn(td, indent && 'pl-8')}>{label}</td>
      <td className={tdNum}>{amount}</td>
    </tr>
  )
}
