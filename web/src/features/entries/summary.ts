import { formatMoney, sub } from '@/lib/money'
import type { Payload } from './payload'
import type { FormVoucherType } from './types'

export type Names = {
  property?: string
  party?: string
  account?: string
  toAccount?: string
  category?: string
  /** code of the vehicle / gold / silver item */
  holding?: string
}

/** "10 tola" as typed on the form (the database converts it to grams exactly). */
const weightOf = (p: Payload) => (p.weight ? `${p.weight} ${p.unit ?? 'tola'}` : null)

/** One plain-language sentence describing what an entry records. */
export function summarize(type: FormVoucherType, p: Payload, n: Names, currency = 'PKR'): string {
  const m = (x: string | null | undefined) => formatMoney(x ?? '0.00', currency)
  const prop = n.property ?? 'the property'
  const item = n.holding ?? 'the item'
  // Seller/buyer balances name whichever the entry belongs to.
  const about = n.property ?? n.holding ?? 'the property'
  switch (type) {
    case 'purchase': {
      const paid = p.paid_now ?? '0.00'
      const owed = sub(p.price ?? '0.00', paid)
      const parts = [`Bought ${prop}${n.party ? ` from ${n.party}` : ''} for ${m(p.price)}.`]
      if (paid !== '0.00') parts.push(`Paid ${m(paid)} now from ${n.account}.`)
      if (owed !== '0.00') parts.push(`${m(owed)} still owed to the seller.`)
      return parts.join(' ')
    }
    case 'property_cost':
      return `Paid ${m(p.amount)} from ${n.account} on ${prop}${p.memo ? ` (${p.memo})` : ''}. Added to its cost.`
    case 'pay_seller':
      return `Paid ${n.party} ${m(p.amount)} from ${n.account} towards ${about}.`
    case 'buyer_advance':
      return `Received ${m(p.amount)} token money from ${n.party} for ${prop} into ${n.account}.`
    case 'sale': {
      const now = p.received_now ?? '0.00'
      const parts = [`Sold ${prop} to ${n.party} for ${m(p.price)}.`]
      if (now !== '0.00') parts.push(`Received ${m(now)} now into ${n.account}.`)
      const rest = sub(p.price ?? '0.00', now)
      if (rest !== '0.00') parts.push(`The remaining ${m(rest)} is covered by token money already received and/or owed by the buyer.`)
      return parts.join(' ')
    }
    case 'receive_buyer':
      return `Received ${m(p.amount)} from ${n.party} for ${about} into ${n.account}.`
    case 'rent':
      return `Received rent of ${m(p.amount)} from ${n.party} for ${prop}${p.period ? ` (${p.period})` : ''} into ${n.account}.`
    case 'deposit':
      return p.direction === 'refunded'
        ? `Refunded security deposit of ${m(p.amount)} to ${n.party} for ${prop} from ${n.account}.`
        : `Received security deposit of ${m(p.amount)} from ${n.party} for ${prop} into ${n.account}.`
    case 'expense': {
      const tags = [n.property, n.holding].filter(Boolean).join(', ')
      return `Paid ${m(p.amount)} for ${n.category} from ${n.account}${tags ? ` (${tags})` : ''}.`
    }
    case 'income':
      return `Received ${m(p.amount)} ${n.category} into ${n.account}${n.property ? ` (${n.property})` : ''}.`
    case 'transfer':
      return `Moved ${m(p.amount)} from ${n.account} to ${n.toAccount}.`
    case 'capital':
      return `Owner put ${m(p.amount)} into ${n.account}.`
    case 'drawing':
      return `Owner took ${m(p.amount)} out of ${n.account}.`
    case 'loan_received':
      return `Borrowed ${m(p.amount)} from ${n.party} into ${n.account}.`
    case 'loan_repayment':
      return `Repaid ${m(p.amount)} to ${n.party} from ${n.account}.`
    case 'holding_purchase': {
      const paid = p.paid_now ?? '0.00'
      const owed = sub(p.price ?? '0.00', paid)
      const w = weightOf(p)
      const parts = [`Bought ${w ? `${w} of ` : ''}${item}${n.party ? ` from ${n.party}` : ''} for ${m(p.price)}.`]
      if (paid !== '0.00') parts.push(`Paid ${m(paid)} now from ${n.account}.`)
      if (owed !== '0.00') parts.push(`${m(owed)} still owed to the seller.`)
      return parts.join(' ')
    }
    case 'holding_cost':
      return `Paid ${m(p.amount)} from ${n.account} on ${item}${p.memo ? ` (${p.memo})` : ''}. Added to its cost.`
    case 'holding_sale': {
      const now = p.received_now ?? '0.00'
      const w = p.whole === 'true' ? 'all of ' : weightOf(p) ? `${weightOf(p)} of ` : ''
      const parts = [`Sold ${w}${item}${n.party ? ` to ${n.party}` : ''} for ${m(p.price)}.`]
      if (now !== '0.00') parts.push(`Received ${m(now)} now into ${n.account}.`)
      const rest = sub(p.price ?? '0.00', now)
      if (rest !== '0.00') parts.push(`The remaining ${m(rest)} is owed by the buyer.`)
      return parts.join(' ')
    }
  }
}
