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

/** "1.25 crore" / "1.5 lakh" for amounts of a lakh or more (how amounts are said in Pakistan). */
export function inLakhCrore(a: Money): string | null {
  const d = new Decimal(a).abs()
  const fmt = (x: Decimal) => x.toDecimalPlaces(2).toString()
  if (d.gte(10_000_000)) return `${fmt(d.div(10_000_000))} crore`
  if (d.gte(100_000)) return `${fmt(d.div(100_000))} lakh`
  return null
}

/** Today's date in the user's time zone as YYYY-MM-DD. */
export const today = () => new Date().toLocaleDateString('en-CA')
