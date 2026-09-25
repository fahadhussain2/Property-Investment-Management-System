import type { PartyRole, VoucherType } from '@/lib/labels'

/**
 * Entry form configuration. Field `name`s ARE the post_voucher payload keys, so a form is just a
 * list of fields; payload.ts validates and normalises them. Posting rules live in the database.
 */
export type FieldKind =
  | 'date'
  | 'property'
  | 'party'
  | 'money_account'
  | 'to_account'
  | 'category'
  | 'money'
  | 'optional_money'
  | 'period'
  | 'direction'
  | 'memo'

export type FieldSpec = {
  name: string
  kind: FieldKind
  label: string
  hint?: string
  /** property picker: hide sold properties */
  unsoldOnly?: boolean
  /** property/party picker: offer "+ New" inline */
  allowCreate?: boolean
  /** property picker: optional (expense/income) */
  optional?: boolean
  /** party picker: roles shown first / assigned to a party created inline */
  roles?: PartyRole[]
  /** category picker */
  categoryType?: 'expense' | 'income'
  /** money account picker is required only when this money field is > 0 */
  requiredIf?: string
}

export type EntryType = {
  type: FormVoucherType
  action: string
  help: string
  group: 'property' | 'rent' | 'money'
  fields: FieldSpec[]
}

export type FormVoucherType = Exclude<VoucherType, 'opening' | 'journal'>

const date: FieldSpec = { name: 'date', kind: 'date', label: 'Date' }
const memo: FieldSpec = { name: 'memo', kind: 'memo', label: 'Note (optional)' }
const from = (extra: Partial<FieldSpec> = {}): FieldSpec => ({ name: 'account_id', kind: 'money_account', label: 'Paid from', ...extra })
const into = (extra: Partial<FieldSpec> = {}): FieldSpec => ({ name: 'account_id', kind: 'money_account', label: 'Received into', ...extra })
const amount = (label = 'Amount'): FieldSpec => ({ name: 'amount', kind: 'money', label })

export const ENTRY_TYPES: EntryType[] = [
  {
    type: 'purchase',
    action: 'Bought a property',
    help: 'Record the full price. If you paid only part now, the rest is tracked as owed to the seller.',
    group: 'property',
    fields: [
      date,
      { name: 'property_id', kind: 'property', label: 'Property', unsoldOnly: true, allowCreate: true },
      { name: 'party_id', kind: 'party', label: 'Seller', roles: ['seller'], allowCreate: true },
      { name: 'price', kind: 'money', label: 'Purchase price' },
      { name: 'paid_now', kind: 'optional_money', label: 'Paid now', hint: 'Leave empty if nothing was paid yet' },
      from({ requiredIf: 'paid_now' }),
      memo,
    ],
  },
  {
    type: 'property_cost',
    action: 'Paid a cost on a property',
    help: 'Registry, transfer fee, renovation, brokerage on purchase: added to the property’s cost.',
    group: 'property',
    fields: [date, { name: 'property_id', kind: 'property', label: 'Property', unsoldOnly: true }, amount(), from(), { ...memo, label: 'What for?' }],
  },
  {
    type: 'pay_seller',
    action: 'Paid the seller a balance',
    help: 'A later payment against a property bought partly on credit.',
    group: 'property',
    fields: [date, { name: 'property_id', kind: 'property', label: 'Property' }, { name: 'party_id', kind: 'party', label: 'Seller', roles: ['seller'] }, amount(), from(), memo],
  },
  {
    type: 'buyer_advance',
    action: 'Received token money from a buyer',
    help: 'Bayana / advance before the sale completes. It is applied automatically when you record the sale.',
    group: 'property',
    fields: [
      date,
      { name: 'property_id', kind: 'property', label: 'Property', unsoldOnly: true },
      { name: 'party_id', kind: 'party', label: 'Buyer', roles: ['buyer'], allowCreate: true },
      amount(),
      into(),
      memo,
    ],
  },
  {
    type: 'sale',
    action: 'Sold a property',
    help: 'Profit is worked out automatically: sale price minus everything the property cost you. Token money already received from this buyer is applied.',
    group: 'property',
    fields: [
      date,
      { name: 'property_id', kind: 'property', label: 'Property', unsoldOnly: true },
      { name: 'party_id', kind: 'party', label: 'Buyer', roles: ['buyer'], allowCreate: true },
      { name: 'price', kind: 'money', label: 'Sale price' },
      { name: 'received_now', kind: 'optional_money', label: 'Received now', hint: 'Leave empty if payment comes later' },
      into({ requiredIf: 'received_now' }),
      memo,
    ],
  },
  {
    type: 'receive_buyer',
    action: 'Received a balance from a buyer',
    help: 'A later payment for a property sold partly on credit.',
    group: 'property',
    fields: [date, { name: 'property_id', kind: 'property', label: 'Property' }, { name: 'party_id', kind: 'party', label: 'Buyer', roles: ['buyer'] }, amount(), into(), memo],
  },
  {
    type: 'rent',
    action: 'Received rent',
    help: 'Recorded under the property, and counted in total rent income.',
    group: 'rent',
    fields: [
      date,
      { name: 'property_id', kind: 'property', label: 'Property', unsoldOnly: true },
      { name: 'party_id', kind: 'party', label: 'Tenant', roles: ['tenant'], allowCreate: true },
      { name: 'period', kind: 'period', label: 'For month (optional)' },
      amount('Rent received'),
      into(),
      memo,
    ],
  },
  {
    type: 'deposit',
    action: 'Security deposit received or refunded',
    help: 'Deposits are held for the tenant, not income.',
    group: 'rent',
    fields: [
      date,
      { name: 'direction', kind: 'direction', label: 'Deposit was' },
      { name: 'property_id', kind: 'property', label: 'Property' },
      { name: 'party_id', kind: 'party', label: 'Tenant', roles: ['tenant'] },
      amount(),
      { name: 'account_id', kind: 'money_account', label: 'Cash or bank account' },
      memo,
    ],
  },
  {
    type: 'expense',
    action: 'Paid an expense',
    help: 'Repairs, bills, taxes, salaries… Pick a property if the expense belongs to one.',
    group: 'money',
    fields: [
      date,
      { name: 'category_account_id', kind: 'category', label: 'Expense head', categoryType: 'expense' },
      amount(),
      from(),
      { name: 'property_id', kind: 'property', label: 'For property (optional)', optional: true },
      memo,
    ],
  },
  {
    type: 'income',
    action: 'Received other income',
    help: 'Commission on deals, fees and other income that is not rent or a sale.',
    group: 'money',
    fields: [
      date,
      { name: 'category_account_id', kind: 'category', label: 'Income head', categoryType: 'income' },
      amount(),
      into(),
      { name: 'property_id', kind: 'property', label: 'For property (optional)', optional: true },
      memo,
    ],
  },
  {
    type: 'transfer',
    action: 'Moved money between cash and bank',
    help: 'Bank withdrawal, deposit into bank, or bank-to-bank transfer.',
    group: 'money',
    fields: [
      date,
      { name: 'account_id', kind: 'money_account', label: 'From' },
      { name: 'to_account_id', kind: 'to_account', label: 'To' },
      amount(),
      memo,
    ],
  },
  {
    type: 'capital',
    action: 'Owner put money into the business',
    help: 'Capital introduced.',
    group: 'money',
    fields: [date, amount(), into(), memo],
  },
  {
    type: 'drawing',
    action: 'Owner took money out',
    help: 'Drawings for personal use.',
    group: 'money',
    fields: [date, amount(), from(), memo],
  },
]

export const entryType = (t: string) => ENTRY_TYPES.find((e) => e.type === t)

export const GROUPS: { key: EntryType['group']; label: string }[] = [
  { key: 'property', label: 'Properties' },
  { key: 'rent', label: 'Rent' },
  { key: 'money', label: 'Money in & out' },
]
