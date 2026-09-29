import type { Database } from './database.types'

type Enums = Database['public']['Enums']
export type PropertyStatus = Enums['property_status']
export type PropertyKind = Enums['property_kind']
export type VoucherType = Enums['voucher_type']
export type AccountType = Enums['account_type']

/** Plain-language labels. The UI never shows raw enum values or accounting jargon in forms. */
export const PROPERTY_STATUS: Record<PropertyStatus, { label: string; className: string }> = {
  vacant: { label: 'Vacant', className: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300' },
  rented: { label: 'Rented', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300' },
  under_agreement: { label: 'Under agreement', className: 'bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300' },
  sold: { label: 'Sold', className: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200' },
}

export const PROPERTY_KINDS: { value: PropertyKind; label: string }[] = [
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'shop', label: 'Shop' },
  { value: 'plot', label: 'Plot' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
]
export const kindLabel = (k: PropertyKind) => PROPERTY_KINDS.find((x) => x.value === k)?.label ?? k

export const AREA_UNITS = ['marla', 'kanal', 'sq ft', 'sq yd', 'sq m'] as const

/** Holdings (spec 003): vehicles, gold and silver items. "Holding" is the word in code; the UI says the class. */
export type HoldingClass = 'vehicle' | 'gold' | 'silver'
export type HoldingStatus = 'held' | 'partly_sold' | 'sold'
export const HOLDING_CLASSES: Record<HoldingClass, { label: string; one: string; path: string }> = {
  vehicle: { label: 'Vehicles', one: 'vehicle', path: '/vehicles' },
  gold: { label: 'Gold', one: 'gold item', path: '/gold' },
  silver: { label: 'Silver', one: 'silver item', path: '/silver' },
}
export const isHoldingClass = (c: unknown): c is HoldingClass => c === 'vehicle' || c === 'gold' || c === 'silver'

export const HOLDING_STATUS: Record<HoldingStatus, { label: string; className: string }> = {
  held: { label: 'Held', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300' },
  partly_sold: { label: 'Partly sold', className: 'bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300' },
  sold: { label: 'Sold', className: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200' },
}

/** Purity presets (fraction of pure metal). The rate is always for pure gold (24K) / pure silver. */
export const PURITIES: Record<'gold' | 'silver', { value: string; label: string }[]> = {
  gold: [
    { value: '1.0000', label: '24K' },
    { value: '0.9167', label: '22K' },
    { value: '0.8750', label: '21K' },
    { value: '0.7500', label: '18K' },
  ],
  silver: [
    { value: '0.9990', label: '999 (pure)' },
    { value: '0.9250', label: '925 (sterling)' },
  ],
}
/** "22K", "999 (pure)", or a percentage for anything else. */
export function purityLabel(cls: string, purity: number | string | null | undefined): string {
  if (purity == null || (cls !== 'gold' && cls !== 'silver')) return ''
  const v = Number(purity).toFixed(4)
  return PURITIES[cls].find((p) => p.value === v)?.label ?? `${(Number(purity) * 100).toFixed(2)}%`
}

export const PARTY_ROLES = [
  { value: 'seller', label: 'Seller' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'agent', label: 'Agent' },
  { value: 'partner', label: 'Partner' },
  { value: 'other', label: 'Other' },
] as const
export type PartyRole = (typeof PARTY_ROLES)[number]['value']
export const roleLabel = (r: string) => PARTY_ROLES.find((x) => x.value === r)?.label ?? r

export const VOUCHER_TYPES: Record<VoucherType, string> = {
  purchase: 'Property purchase',
  property_cost: 'Property cost',
  pay_seller: 'Payment to seller',
  buyer_advance: 'Advance from buyer',
  sale: 'Property sale',
  receive_buyer: 'Received from buyer',
  rent: 'Rent received',
  deposit: 'Security deposit',
  expense: 'Expense',
  income: 'Other income',
  transfer: 'Transfer',
  capital: 'Capital introduced',
  drawing: 'Owner drawing',
  opening: 'Opening balance',
  journal: 'Journal entry',
  holding_purchase: 'Vehicle / gold / silver purchase',
  holding_cost: 'Vehicle / gold / silver cost',
  holding_sale: 'Vehicle / gold / silver sale',
}

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'asset', label: 'Assets' },
  { value: 'liability', label: 'Liabilities' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expenses' },
]

/** Heads of account a user can add (see add_category_account). */
export const CATEGORY_KINDS = [
  { value: 'property_expense', label: 'Property expense (repairs, bills, taxes…)' },
  { value: 'vehicle_expense', label: 'Vehicle expense (fuel, repairs, token tax…)' },
  { value: 'general_expense', label: 'Office / general expense' },
  { value: 'selling_expense', label: 'Selling expense (brokerage…)' },
  { value: 'income', label: 'Other income' },
] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]['value']
