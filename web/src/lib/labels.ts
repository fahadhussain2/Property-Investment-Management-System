import type { Database } from './database.types'

type Enums = Database['public']['Enums']
export type PropertyStatus = Enums['property_status']
export type PropertyKind = Enums['property_kind']
export type VoucherType = Enums['voucher_type']
export type AccountType = Enums['account_type']

/** Plain-language labels. The UI never shows raw enum values or accounting jargon in forms. */
export const PROPERTY_STATUS: Record<PropertyStatus, { label: string; className: string }> = {
  vacant: { label: 'Vacant', className: 'bg-amber-100 text-amber-900' },
  rented: { label: 'Rented', className: 'bg-emerald-100 text-emerald-900' },
  under_agreement: { label: 'Under agreement', className: 'bg-sky-100 text-sky-900' },
  sold: { label: 'Sold', className: 'bg-zinc-200 text-zinc-700' },
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
  { value: 'general_expense', label: 'Office / general expense' },
  { value: 'selling_expense', label: 'Selling expense (brokerage…)' },
  { value: 'income', label: 'Other income' },
] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]['value']
