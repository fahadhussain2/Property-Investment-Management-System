import Decimal from 'decimal.js'

/**
 * Weights (gold, silver) travel like money: as decimal strings, never JS numbers. The database stores
 * grams (numeric(24,10)); entries send the weight as typed plus its unit, and SQL converts
 * (unit_to_grams), so the form never does the conversion that is booked. Conversions here are for display.
 */
export type Grams = string
export type WeightUnit = 'g' | 'kg' | 'tola'

export const TOLA_IN_GRAMS = '11.6638038'
const FACTOR: Record<WeightUnit, string> = { g: '1', kg: '1000', tola: TOLA_IN_GRAMS }

export const WEIGHT_UNITS: { value: WeightUnit; label: string }[] = [
  { value: 'tola', label: 'tola' },
  { value: 'g', label: 'grams' },
  { value: 'kg', label: 'kg' },
]
export const isWeightUnit = (u: unknown): u is WeightUnit => u === 'g' || u === 'kg' || u === 'tola'

const WEIGHT_INPUT = /^\d+(\.\d{1,3})?$/

/** Parse a typed weight ("10", "1,000.5") into a plain decimal string with at most 3 places. Throws otherwise. */
export function parseWeight(input: string): string {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!WEIGHT_INPUT.test(cleaned) || new Decimal(cleaned).isZero()) throw new Error(`Invalid weight: "${input}"`)
  return new Decimal(cleaned).toString()
}

/** Normalises a weight from the API (PostgREST sends numeric as a JSON number) into a grams string. */
export const toGrams = (x: number | string | null | undefined): Grams => new Decimal(x ?? 0).toString()

export const unitToGrams = (qty: string, unit: WeightUnit): Grams => new Decimal(qty).times(FACTOR[unit]).toString()

/** Grams expressed in a unit, rounded to 3 decimals (trailing zeros dropped). */
export const fromGrams = (g: Grams, unit: WeightUnit): string =>
  new Decimal(g).div(FACTOR[unit]).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toString()

const group = (s: string) => {
  const [int, frac] = s.split('.')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`
}

/** "7 tola", "1,058.319 g", "1.058 kg". */
export function formatWeight(g: Grams, unit: WeightUnit): string {
  return `${group(fromGrams(g, unit))} ${unit}`
}

export const isZeroWeight = (g: Grams) => new Decimal(g).isZero()
