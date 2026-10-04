import Decimal from 'decimal.js'

/** Money travels as a decimal string with exactly 2 places, e.g. "12500000.00". Never a JS number. */
export type Money = string

const MONEY_INPUT = /^-?\d+(\.\d{1,2})?$/

/** Parse user input ("12,500,000" / "1500.5") into Money. Throws on anything else. */
export function parseMoney(input: string): Money {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!MONEY_INPUT.test(cleaned)) throw new Error(`Invalid amount: "${input}"`)
  return new Decimal(cleaned).toFixed(2)
}

export const add = (a: Money, b: Money): Money => new Decimal(a).plus(b).toFixed(2)
export const sub = (a: Money, b: Money): Money => new Decimal(a).minus(b).toFixed(2)
export const sum = (xs: Money[]): Money => xs.reduce(add, '0.00')
export const isZero = (a: Money): boolean => new Decimal(a).isZero()
export const isNegative = (a: Money): boolean => new Decimal(a).isNegative() && !isZero(a)
export const compare = (a: Money, b: Money): number => new Decimal(a).comparedTo(b)

/** Display with thousands separators, e.g. "Rs 12,500,000" (decimals only when non-zero). */
export function formatMoney(a: Money, currency = 'PKR'): string {
  const d = new Decimal(a)
  const [int, frac] = d.abs().toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const symbol = currency === 'PKR' ? 'Rs' : currency
  return `${d.isNegative() && !d.isZero() ? '-' : ''}${symbol} ${grouped}${frac === '00' ? '' : `.${frac}`}`
}

/**
 * Normalises a numeric value from the API into Money. PostgREST returns `numeric` columns as JSON
 * numbers; convert them here at the edge and never do arithmetic on the raw number.
 */
export const toMoney = (x: number | string | null | undefined): Money => new Decimal(x ?? 0).toFixed(2)

/**
 * GEOMETRY ONLY: a plain number for positioning a chart mark (bar height, point, bar width %).
 * Never use it for a displayed figure or for arithmetic on money; format the Money string instead.
 */
export const toChartNumber = (a: Money): number => new Decimal(a).toNumber()

/** GEOMETRY ONLY: |a| as a percentage (0–100) of |of|, for bar widths. 0 when `of` is zero. */
export function sharePct(a: Money, of: Money): number {
  const base = new Decimal(of).abs()
  if (base.isZero()) return 0
  return Decimal.min(new Decimal(a).abs().div(base).times(100), 100).toDecimalPlaces(2).toNumber()
}

/** "1.25 crore" / "1.5 lakh" for amounts of a lakh or more (how amounts are said in Pakistan). */
export function inLakhCrore(a: Money): string | null {
  const d = new Decimal(a).abs()
  const fmt = (x: Decimal) => x.toDecimalPlaces(2).toString()
  if (d.gte(10_000_000)) return `${fmt(d.div(10_000_000))} crore`
  if (d.gte(100_000)) return `${fmt(d.div(100_000))} lakh`
  return null
}

/**
 * A short figure for a glance line (the dashboard's cash / bank split), never for a figure a user acts on:
 * PKR "5.5 lakh" / "1.13 crore", other currencies "250K" / "5M"; at most 2 decimals, rounded half up.
 * Below a lakh (or a thousand) it stays exact ("45,000"). No currency symbol: the line's label says what it is.
 */
export function formatCompact(a: Money, currency = 'PKR'): string {
  const d = new Decimal(a)
  const sign = d.isNegative() && !d.isZero() ? '-' : ''
  const abs = d.abs()
  // Largest first. A value that rounds up to the next unit uses that unit (9,999,999 is "1 crore", not "100 lakh").
  const units: [number, string][] =
    currency === 'PKR'
      ? [
          [10_000_000, ' crore'],
          [100_000, ' lakh'],
        ]
      : [
          [1_000_000, 'M'],
          [1_000, 'K'],
        ]
  const i = units.findIndex(([size]) => abs.gte(size))
  if (i >= 0) {
    const [size, name] = units[i]
    const x = abs.div(size).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    const bigger = units[i - 1]
    if (bigger && x.times(size).gte(bigger[0])) return `${sign}1${bigger[1]}`
    return `${sign}${x.toString()}${name}`
  }
  const [int, frac] = abs.toFixed(2).split('.')
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac === '00' ? '' : `.${frac}`}`
}

/** Today's date in the user's time zone as YYYY-MM-DD. */
export const today = () => new Date().toLocaleDateString('en-CA')
