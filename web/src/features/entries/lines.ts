import { add, compare, parseMoney, type Money } from '@/lib/money'

export type JournalLine = {
  account_id: string
  debit?: Money
  credit?: Money
  property_id?: string
  party_id?: string
}

/** Parses an optional amount: '' -> null, invalid or negative -> 'invalid'. */
export function optionalAmount(raw: string | undefined): Money | null | 'invalid' {
  const v = (raw ?? '').trim()
  if (!v) return null
  try {
    const m = parseMoney(v)
    return compare(m, '0.00') < 0 ? 'invalid' : m
  } catch {
    return 'invalid'
  }
}

export type OpeningInput = {
  money: { account_id: string; amount: string }[]
  properties: { property_id: string; cost: string }[]
  /** property_id (optional) tags the balance to a property, so it shows in that property's history */
  owedToUs: { party_id: string; amount: string; property_id?: string }[]
  weOwe: { party_id: string; amount: string; property_id?: string }[]
}
export type SystemAccounts = { properties: string; receivable: string; payable: string }

/**
 * Opening balances -> journal lines. The database adds the balancing line to Opening Balance Equity.
 * Rows with no amount are ignored; a row with an amount must name its property/party.
 */
export function buildOpeningLines(
  input: OpeningInput,
  sys: SystemAccounts,
): { lines: JournalLine[]; errors: Record<string, string> } {
  const lines: JournalLine[] = []
  const errors: Record<string, string> = {}
  input.money.forEach((r, i) => {
    const m = optionalAmount(r.amount)
    if (m === 'invalid') errors[`money.${i}`] = 'Enter an amount like 1,500,000'
    else if (m && compare(m, '0.00') > 0) lines.push({ account_id: r.account_id, debit: m })
  })
  const rows: [keyof OpeningInput, string, 'debit' | 'credit', 'property_id' | 'party_id'][] = [
    ['properties', sys.properties, 'debit', 'property_id'],
    ['owedToUs', sys.receivable, 'debit', 'party_id'],
    ['weOwe', sys.payable, 'credit', 'party_id'],
  ]
  for (const [section, account, side, tag] of rows) {
    ;(input[section] as Record<string, string>[]).forEach((r, i) => {
      const m = optionalAmount(r.cost ?? r.amount)
      if (m === 'invalid') errors[`${section}.${i}`] = 'Enter an amount like 1,500,000'
      else if (m && compare(m, '0.00') > 0) {
        if (!r[tag]) errors[`${section}.${i}`] = tag === 'property_id' ? 'Choose the property' : 'Choose the party'
        else lines.push({ account_id: account, [side]: m, [tag]: r[tag], ...(tag === 'party_id' && r.property_id ? { property_id: r.property_id } : {}) })
      }
    })
  }
  if (!lines.length && !Object.keys(errors).length) errors.form = 'Enter at least one opening amount'
  return { lines, errors }
}

/** Totals of a journal and whether it can be saved (balanced, non-zero, one side per line). */
export function journalTotals(rows: { account_id: string; debit: string; credit: string }[]) {
  let debit: Money = '0.00'
  let credit: Money = '0.00'
  let valid = rows.length >= 2
  const nonZero = (m: Money | null | 'invalid') => (m === '0.00' ? null : m)
  for (const r of rows) {
    const d = nonZero(optionalAmount(r.debit))
    const c = nonZero(optionalAmount(r.credit))
    if (d === 'invalid' || c === 'invalid' || !r.account_id || (!!d === !!c)) valid = false
    if (d && d !== 'invalid') debit = add(debit, d)
    if (c && c !== 'invalid') credit = add(credit, c)
  }
  const balanced = debit === credit && compare(debit, '0.00') > 0
  return { debit, credit, balanced, canSave: valid && balanced }
}
