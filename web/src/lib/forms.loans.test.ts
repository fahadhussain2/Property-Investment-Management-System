import { describe, expect, it } from 'vitest'
import { friendlyError } from './forms'

// Spec 008: the loan messages are plain sentences raised by post_voucher and the loan guard; they pass through unchanged.
describe('friendlyError: loans', () => {
  it.each([
    'You owe Ali only PKR 300,000.00.',
    'Choose a lender.',
    'A loan entry cannot be dated in the future.',
    'Ali has been repaid more than the loans on record (short by 200,000.00). Void or edit the repayments first.',
  ])('%s', (message) => {
    expect(friendlyError(new Error(message))).toBe(message)
  })
})
