// Which money accounts the Cash & Bank page lists. Pure, so unit tests need no environment.
import { isZero, type Money } from '@/lib/money'

export type MoneyKind = 'all' | 'cash' | 'bank'

export const MONEY_KINDS: { value: MoneyKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
]

/** The `?kind=` of the URL (the dashboard's Cash and Bank tiles link to it); anything else means all. */
export const moneyKindOf = (param: string | null): MoneyKind =>
  param === 'cash' || param === 'bank' ? param : 'all'

type MoneyAccount = { subtype: string; is_active: boolean; balance: Money }

/**
 * Cash and bank accounts of the chosen kind. Hidden accounts are listed only if they still hold money (they
 * cannot, by rule, but never hide money).
 */
export function moneyAccounts<T extends MoneyAccount>(accounts: T[], kind: MoneyKind): T[] {
  return accounts.filter(
    (a) =>
      (a.subtype === 'cash' || a.subtype === 'bank') &&
      (kind === 'all' || a.subtype === kind) &&
      (a.is_active || !isZero(a.balance)),
  )
}
