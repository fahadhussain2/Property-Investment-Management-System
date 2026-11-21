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
  | 'lease'
  | 'memo'
  | 'holding'

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
  /** property/party of a rent or deposit: drawn by the lease picker, and needed only when no lease is chosen */
  inLease?: boolean
  /** holding picker: which classes it offers ('metal' = gold and silver) */
  holdingClass?: HoldingFilter
  /** holding picker: also asks for the weight of a gold/silver item (bought, or sold / "the whole item") */
  weight?: 'buy' | 'sell'
}

export type HoldingFilter = 'vehicle' | 'metal' | 'any'

/** A menu entry that opens the same form narrowed to vehicles or to gold/silver (/new/<type>?class=…). */
export type EntryVariant = { class: 'vehicle' | 'metal'; action: string; help: string; holdingLabel: string }

export type EntryType = {
  type: FormVoucherType
  action: string
  help: string
  group: 'property' | 'holdings' | 'rent' | 'money'
  fields: FieldSpec[]
  variants?: EntryVariant[]
}

export type FormVoucherType = Exclude<VoucherType, 'opening' | 'journal'>

const date: FieldSpec = { name: 'date', kind: 'date', label: 'Date' }
const memo: FieldSpec = { name: 'memo', kind: 'memo', label: 'Note (optional)' }
const from = (extra: Partial<FieldSpec> = {}): FieldSpec => ({ name: 'account_id', kind: 'money_account', label: 'Paid from', ...extra })
const into = (extra: Partial<FieldSpec> = {}): FieldSpec => ({ name: 'account_id', kind: 'money_account', label: 'Received into', ...extra })
const lease: FieldSpec = { name: 'lease_id', kind: 'lease', label: 'Lease' }
const amount = (label = 'Amount'): FieldSpec => ({ name: 'amount', kind: 'money', label })
/** Seller/buyer balances: a property, or else a vehicle / gold / silver item (exactly one). */
const orItem: FieldSpec = { name: 'holding_id', kind: 'holding', label: 'Or vehicle / gold / silver item', optional: true, holdingClass: 'any' }

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
    help: 'A later payment against a property, vehicle or gold/silver bought partly on credit.',
    group: 'property',
    fields: [date, { name: 'property_id', kind: 'property', label: 'Property', optional: true }, orItem, { name: 'party_id', kind: 'party', label: 'Seller', roles: ['seller'] }, amount(), from(), memo],
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
    help: 'A later payment for a property, vehicle or gold/silver sold partly on credit.',
    group: 'property',
    fields: [date, { name: 'property_id', kind: 'property', label: 'Property', optional: true }, orItem, { name: 'party_id', kind: 'party', label: 'Buyer', roles: ['buyer'] }, amount(), into(), memo],
  },
  {
    type: 'holding_purchase',
    action: 'Bought a vehicle, gold or silver',
    help: 'Record the full price (and for gold or silver, the weight). If you paid only part now, the rest is tracked as owed to the seller.',
    group: 'holdings',
    variants: [
      { class: 'vehicle', action: 'Bought a vehicle', help: 'Record the full price. If you paid only part now, the rest is tracked as owed to the seller.', holdingLabel: 'Vehicle' },
      { class: 'metal', action: 'Bought gold or silver', help: 'Record the weight and the full price. Buying more of the same item adds to its weight.', holdingLabel: 'Item' },
    ],
    fields: [
      date,
      { name: 'holding_id', kind: 'holding', label: 'Vehicle or item', holdingClass: 'any', unsoldOnly: true, allowCreate: true, weight: 'buy' },
      { name: 'party_id', kind: 'party', label: 'Seller', roles: ['seller'], allowCreate: true },
      { name: 'price', kind: 'money', label: 'Purchase price' },
      { name: 'paid_now', kind: 'optional_money', label: 'Paid now', hint: 'Leave empty if nothing was paid yet' },
      from({ requiredIf: 'paid_now' }),
      memo,
    ],
  },
  {
    type: 'holding_cost',
    action: 'Paid a cost on a vehicle, gold or silver item',
    help: 'Registration transfer, modifications, making charges: added to its cost (not to running expenses).',
    group: 'holdings',
    fields: [
      date,
      { name: 'holding_id', kind: 'holding', label: 'Vehicle or item', holdingClass: 'any', unsoldOnly: true },
      amount(),
      from(),
      { ...memo, label: 'What for?' },
    ],
  },
  {
    type: 'holding_sale',
    action: 'Sold a vehicle, gold or silver',
    help: 'The gain is worked out automatically: sale price minus what it cost you (for part of a gold or silver item, its share of the cost).',
    group: 'holdings',
    variants: [
      { class: 'vehicle', action: 'Sold a vehicle', help: 'The gain is worked out automatically: sale price minus everything the vehicle cost you.', holdingLabel: 'Vehicle' },
      { class: 'metal', action: 'Sold gold or silver', help: 'Sell a whole item or part of its weight. Part of an item takes its share of the cost.', holdingLabel: 'Item' },
    ],
    fields: [
      date,
      { name: 'holding_id', kind: 'holding', label: 'Vehicle or item', holdingClass: 'any', unsoldOnly: true, weight: 'sell' },
      { name: 'party_id', kind: 'party', label: 'Buyer', roles: ['buyer'], allowCreate: true },
      { name: 'price', kind: 'money', label: 'Sale price' },
      { name: 'received_now', kind: 'optional_money', label: 'Received now', hint: 'Leave empty if payment comes later' },
      into({ requiredIf: 'received_now' }),
      memo,
    ],
  },
  {
    type: 'rent',
    action: 'Received rent',
    help: 'Recorded under the property, and counted in total rent income.',
    group: 'rent',
    fields: [
      date,
      lease,
      { name: 'property_id', kind: 'property', label: 'Property', unsoldOnly: true, inLease: true },
      { name: 'party_id', kind: 'party', label: 'Tenant', roles: ['tenant'], allowCreate: true, inLease: true },
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
      lease,
      { name: 'property_id', kind: 'property', label: 'Property', inLease: true },
      { name: 'party_id', kind: 'party', label: 'Tenant', roles: ['tenant'], inLease: true },
      amount(),
      { name: 'account_id', kind: 'money_account', label: 'Cash or bank account' },
      memo,
    ],
  },
  {
    type: 'expense',
    action: 'Paid an expense',
    help: 'Repairs, bills, fuel, taxes, salaries… Pick a property or vehicle if the expense belongs to one.',
    group: 'money',
    fields: [
      date,
      { name: 'category_account_id', kind: 'category', label: 'Expense head', categoryType: 'expense' },
      amount(),
      from(),
      { name: 'property_id', kind: 'property', label: 'For property (optional)', optional: true },
      { name: 'holding_id', kind: 'holding', label: 'For vehicle (optional)', optional: true, holdingClass: 'vehicle' },
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
  {
    type: 'loan_received',
    action: 'Borrowed money',
    help: 'Someone lent the business money. It is a debt to repay, not income.',
    group: 'money',
    fields: [date, { name: 'party_id', kind: 'party', label: 'Lender', roles: ['lender'], allowCreate: true }, amount(), into(), memo],
  },
  {
    type: 'loan_repayment',
    action: 'Repaid a loan',
    help: 'Money paid back to a lender. It is not an expense.',
    group: 'money',
    fields: [date, { name: 'party_id', kind: 'party', label: 'Lender', roles: ['lender'] }, amount(), from(), memo],
  },
]

export const entryType = (t: string) => ENTRY_TYPES.find((e) => e.type === t)

export const GROUPS: { key: EntryType['group']; label: string }[] = [
  // Order on /new (product owner, 2026-10-06): Money in & out first, Properties under Rent in the second column.
  { key: 'money', label: 'Money in & out' },
  { key: 'holdings', label: 'Vehicles, gold & silver' },
  { key: 'rent', label: 'Rent' },
  { key: 'property', label: 'Properties' },
]
