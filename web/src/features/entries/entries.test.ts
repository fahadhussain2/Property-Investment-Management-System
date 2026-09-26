import { describe, expect, it } from 'vitest'
import { inLakhCrore } from '@/lib/money'
import { buildPayload, payloadToValues } from './payload'
import { summarize } from './summary'
import { ENTRY_TYPES, entryType } from './types'

const purchase = entryType('purchase')!
const sale = entryType('sale')!
const transfer = entryType('transfer')!

describe('buildPayload', () => {
  it('purchase with nothing paid now: no money account needed, seller required', () => {
    const r = buildPayload(purchase, { date: '2026-01-10', property_id: 'p1', party_id: 's1', price: '10,000,000' })
    expect(r.errors).toBeNull()
    expect(r.payload).toMatchObject({ type: 'purchase', price: '10000000.00', paid_now: null, account_id: null })
    const noSeller = buildPayload(purchase, { date: '2026-01-10', property_id: 'p1', price: '100' })
    expect(noSeller.errors?.party_id).toMatch(/seller/)
  })

  it('purchase paid in full needs no seller but needs the money account', () => {
    expect(buildPayload(purchase, { date: '2026-01-10', property_id: 'p1', price: '100', paid_now: '100' }).errors).toEqual({
      account_id: 'Choose a cash or bank account',
    })
    expect(buildPayload(purchase, { date: '2026-01-10', property_id: 'p1', price: '100', paid_now: '100', account_id: 'a1' }).errors).toBeNull()
    expect(buildPayload(purchase, { date: '2026-01-10', property_id: 'p1', party_id: 's', price: '100', paid_now: '200', account_id: 'a' }).errors?.paid_now).toMatch(/more than/)
  })

  it('sale keeps money as exact decimal strings', () => {
    const r = buildPayload(sale, { date: '2026-06-01', property_id: 'p', party_id: 'b', price: '12500000.5', received_now: '12,500,000.50', account_id: 'a' })
    expect(r.payload).toMatchObject({ price: '12500000.50', received_now: '12500000.50' })
  })

  it('transfer maps from/to and rejects the same account twice', () => {
    const r = buildPayload(transfer, { date: '2026-03-01', account_id: 'bank', to_account_id: 'cash', amount: '500000' })
    expect(r.payload).toMatchObject({ account_id: 'bank', to_account_id: 'cash', amount: '500000.00' })
    expect(buildPayload(transfer, { date: '2026-03-01', account_id: 'x', to_account_id: 'x', amount: '1' }).errors?.to_account_id).toBeTruthy()
  })

  it('rejects zero, negative and malformed required amounts; includes every field (null when empty)', () => {
    const cap = entryType('capital')!
    expect(buildPayload(cap, { date: '2026-01-01', amount: '0', account_id: 'a' }).errors?.amount).toBeTruthy()
    expect(buildPayload(cap, { date: '2026-01-01', amount: '-5', account_id: 'a' }).errors?.amount).toBeTruthy()
    expect(buildPayload(cap, { date: '2026-01-01', amount: '1.234', account_id: 'a' }).errors?.amount).toBeTruthy()
    expect(buildPayload(cap, { date: '2026-01-01', amount: '5', account_id: 'a' }).payload).toEqual({
      type: 'capital', date: '2026-01-01', amount: '5.00', account_id: 'a', memo: null,
    })
  })

  it('every entry type validates its date and required pickers', () => {
    for (const e of ENTRY_TYPES) expect(buildPayload(e, {}).errors?.date).toBe('Pick a date')
  })

  it('payloadToValues round-trips an edit', () => {
    const r = buildPayload(sale, { date: '2026-06-01', property_id: 'p', party_id: 'b', price: '100', received_now: '40', account_id: 'a' })
    const again = buildPayload(sale, payloadToValues(r.payload))
    expect(again.payload).toEqual(r.payload)
  })
})

describe('summaries and big numbers', () => {
  it('describes a part-paid purchase in plain language', () => {
    const p = buildPayload(purchase, { date: '2026-01-10', property_id: 'p', party_id: 's', price: '10000000', paid_now: '4000000', account_id: 'a' }).payload!
    expect(summarize('purchase', p, { property: 'DP-25', party: 'Seller A', account: 'Meezan' })).toBe(
      'Bought DP-25 from Seller A for Rs 10,000,000. Paid Rs 4,000,000 now from Meezan. Rs 6,000,000 still owed to the seller.',
    )
  })

  it('says amounts in lakh and crore', () => {
    expect(inLakhCrore('12500000.00')).toBe('1.25 crore')
    expect(inLakhCrore('150000.00')).toBe('1.5 lakh')
    expect(inLakhCrore('99999.00')).toBeNull()
  })
})

describe('opening balances and journal', async () => {
  const { buildOpeningLines, journalTotals } = await import('./lines')
  const sys = { properties: 'acc-1200', receivable: 'acc-1300', payable: 'acc-2000', deposits: 'acc-2200', advances: 'acc-2100' }

  it('turns the wizard into journal lines, skipping empty rows', () => {
    const { lines, errors } = buildOpeningLines(
      {
        money: [{ account_id: 'meezan', amount: '20,000,000' }, { account_id: 'cash', amount: '' }],
        properties: [{ property_id: 'dp25', cost: '9000000' }, { property_id: '', cost: '' }],
        owedToUs: [{ party_id: 'buyer', amount: '150000' }],
        weOwe: [{ party_id: 'seller', amount: '600000' }],
      },
      sys,
    )
    expect(errors).toEqual({})
    expect(lines).toEqual([
      { account_id: 'meezan', debit: '20000000.00' },
      { account_id: 'acc-1200', debit: '9000000.00', property_id: 'dp25' },
      { account_id: 'acc-1300', debit: '150000.00', party_id: 'buyer' },
      { account_id: 'acc-2000', credit: '600000.00', party_id: 'seller' },
    ])
  })

  it('tags an opening receivable/payable with its property when one is chosen', () => {
    const { lines } = buildOpeningLines(
      { money: [], properties: [], owedToUs: [{ party_id: 'buyer', amount: '5', property_id: 'dp25' }], weOwe: [{ party_id: 'seller', amount: '7', property_id: '' }] },
      sys,
    )
    expect(lines).toEqual([
      { account_id: 'acc-1300', debit: '5.00', party_id: 'buyer', property_id: 'dp25' },
      { account_id: 'acc-2000', credit: '7.00', party_id: 'seller' },
    ])
  })

  it('records deposits held and token money as amounts owed, tagged with party and property', () => {
    const none = { money: [], properties: [], owedToUs: [], weOwe: [] }
    const { lines, errors } = buildOpeningLines(
      {
        ...none,
        deposits: [{ party_id: 'tenant', property_id: 'shop4', amount: '100,000' }, { party_id: '', property_id: '', amount: '' }],
        advances: [{ party_id: 'buyer', property_id: 'plot9', amount: '500000' }],
      },
      sys,
    )
    expect(errors).toEqual({})
    expect(lines).toEqual([
      { account_id: 'acc-2200', credit: '100000.00', party_id: 'tenant', property_id: 'shop4' },
      { account_id: 'acc-2100', credit: '500000.00', party_id: 'buyer', property_id: 'plot9' },
    ])
    expect(buildOpeningLines({ ...none, deposits: [{ party_id: 't', property_id: '', amount: '5' }] }, sys).errors).toEqual({
      'deposits.0': 'Choose the property',
    })
    expect(buildOpeningLines({ ...none, advances: [{ party_id: '', property_id: 'p', amount: '5' }] }, sys).errors).toEqual({
      'advances.0': 'Choose the buyer',
    })
  })

  it('asks for the property/party when an amount is given, and for at least one amount', () => {
    const none = { money: [], properties: [], owedToUs: [], weOwe: [] }
    expect(buildOpeningLines({ ...none, properties: [{ property_id: '', cost: '5' }] }, sys).errors).toEqual({ 'properties.0': 'Choose the property' })
    expect(buildOpeningLines(none, sys).errors.form).toBeTruthy()
  })

  it('journal can be saved only when balanced, non-zero and one side per line', () => {
    expect(journalTotals([{ account_id: 'a', debit: '1500', credit: '' }, { account_id: 'b', debit: '', credit: '1500' }])).toMatchObject({
      debit: '1500.00', credit: '1500.00', canSave: true,
    })
    expect(journalTotals([{ account_id: 'a', debit: '1500', credit: '' }, { account_id: 'b', debit: '', credit: '1000' }]).canSave).toBe(false)
    expect(journalTotals([{ account_id: 'a', debit: '5', credit: '5' }, { account_id: 'b', debit: '', credit: '' }]).canSave).toBe(false)
  })
})

describe('M4 review regressions', async () => {
  const { journalTotals } = await import('./lines')
  it('a "0" in the journal counts as empty, so an all-zero line cannot be reviewed', () => {
    expect(journalTotals([{ account_id: 'a', debit: '100', credit: '0' }, { account_id: 'b', debit: '0', credit: '100' }]).canSave).toBe(true)
    expect(journalTotals([{ account_id: 'a', debit: '0', credit: '0' }, { account_id: 'b', debit: '', credit: '' }]).canSave).toBe(false)
  })
})

describe('M6: rent and deposits against a lease', () => {
  const rent = entryType('rent')!
  it('with a lease, property and tenant are not asked for', () => {
    const r = buildPayload(rent, { date: '2026-01-05', lease_id: 'L1', amount: '50000', account_id: 'a' })
    expect(r.errors).toBeNull()
    expect(r.payload).toMatchObject({ lease_id: 'L1', property_id: null, party_id: null, amount: '50000.00' })
  })
  it('without a lease, property and tenant are required, and lease_id is sent as null (a correction clears it)', () => {
    expect(buildPayload(rent, { date: '2026-01-05', amount: '50000', account_id: 'a' }).errors).toMatchObject({
      property_id: expect.any(String),
      party_id: expect.any(String),
    })
    const r = buildPayload(rent, { date: '2026-01-05', property_id: 'p', party_id: 't', amount: '50000', account_id: 'a' })
    expect(r.payload).toHaveProperty('lease_id', null)
  })
  it('deposit keeps the lease and direction', () => {
    const r = buildPayload(entryType('deposit')!, { date: '2026-01-05', lease_id: 'L1', direction: 'refunded', amount: '1000', account_id: 'a' })
    expect(r.payload).toMatchObject({ lease_id: 'L1', direction: 'refunded' })
  })
})
