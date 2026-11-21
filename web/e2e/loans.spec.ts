import { expect, test, type Page } from '@playwright/test'
import { choose, expectNoHorizontalScroll, newBusiness, openingBalances, PASSWORD, review, save, SIGN_UP_TIMEOUT, unique } from './helpers'

// Spec 008: loans are money borrowed from a lender and repaid later. They move cash and the debt, never profit.
// Record a loan and repayments from /new, the Loans pages, void, a viewer, and phones.

/** The dashboard figures that come from the books. */
async function dashboard(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('total-cash')).toBeVisible()
  await expect(page.getByTestId('profit-fy')).toBeVisible()
  const t = async (id: string) => (await page.getByTestId(id).textContent())?.trim()
  return { cash: await t('cash-total'), total: await t('total-cash'), profit: await t('profit-fy') }
}

async function borrow(page: Page, lender: string | null, amount: string, summary?: string) {
  await page.goto('/new/loan_received')
  if (lender) {
    await page.getByRole('button', { name: 'New lender' }).click()
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(lender)
    await expect(page.getByRole('dialog').getByLabel('Lender')).toBeChecked()
    await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  }
  await page.getByLabel('Amount').fill(amount)
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  if (summary) await expect(page.getByTestId('entry-summary')).toHaveText(summary)
  await save(page)
}

async function repay(page: Page, lender: string, amount: string, summary?: string) {
  await page.goto('/new/loan_repayment')
  await choose(page.getByLabel('Lender', { exact: true }), lender)
  await page.getByLabel('Amount').fill(amount)
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await review(page)
  if (summary) await expect(page.getByTestId('entry-summary')).toHaveText(summary)
  await save(page)
}

test('borrow and repay: the Loans pages follow, cash moves, profit does not, a void is kept', async ({ page }) => {
  test.slow() // a long multi-screen flow
  await newBusiness(page, 'loans')
  await openingBalances(page, { 'Cash in Hand': '100000' })
  const before = await dashboard(page)

  await borrow(page, 'Ali', '500000', 'Borrowed Rs 500,000 from Ali into Cash in Hand.')

  await page.goto('/loans')
  await expect(page.getByRole('heading', { name: 'Loans', level: 1 })).toBeVisible()
  await expect(page.getByTestId('loans-owed')).toHaveText('Rs 500,000')
  const card = page.getByTestId('lender-card').filter({ hasText: 'Ali' })
  await expect(card).toContainText('Borrowed Rs 500,000 · Repaid Rs 0')

  await repay(page, 'Ali', '200000', 'Repaid Rs 200,000 to Ali from Cash in Hand.')

  await page.goto('/loans')
  await expect(page.getByTestId('loans-owed')).toHaveText('Rs 300,000')
  await card.click()
  await expect(page.getByRole('heading', { name: 'Ali', level: 1 })).toBeVisible()
  await expect(page.getByTestId('lender-borrowed')).toHaveText('Rs 500,000')
  await expect(page.getByTestId('lender-repaid')).toHaveText('Rs 200,000')
  await expect(page.getByTestId('lender-owed-now')).toHaveText('Rs 300,000')
  const statement = page.getByTestId('loan-statement')
  await expect(statement).toContainText('Loan received · LNR-0001')
  await expect(statement).toContainText('Loan repayment · LNP-0001')
  await expect(page.getByTestId('ledger-closing')).toHaveText('Rs 300,000')

  // Cash went up by the loan and down by the repayment; profit did not move.
  const after = await dashboard(page)
  expect(after.profit).toBe(before.profit)
  await expect(page.getByTestId('cash-total')).toContainText('Rs 400,000')
  expect(after.cash).not.toBe(before.cash)

  // More than is owed is refused with the reason.
  await page.goto('/new/loan_repayment')
  await choose(page.getByLabel('Lender', { exact: true }), 'Ali')
  await page.getByLabel('Amount').fill('300000.01')
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByText(/You owe Ali only Rs 300,000/)).toBeVisible()

  // Void the repayment: the debt comes back, the voided line stays on the statement.
  await page.goto('/entries')
  await page.getByRole('link', { name: /LNP-0001/ }).first().click()
  await page.getByRole('button', { name: 'Void' }).click()
  await page.getByRole('dialog').getByLabel('Reason').fill('Paid on the wrong day')
  await page.getByRole('dialog').getByRole('button', { name: 'Void entry' }).click()
  await expect(page.locator('[data-slot=badge]', { hasText: 'Voided' })).toBeVisible()
  await page.goto('/loans')
  await expect(page.getByTestId('loans-owed')).toHaveText('Rs 500,000')
  await page.getByTestId('lender-card').filter({ hasText: 'Ali' }).click()
  await expect(page.getByTestId('loan-statement')).toContainText('LNP-0001')
  await expect(page.getByTestId('ledger-closing')).toHaveText('Rs 500,000')

  // A loan that has been repaid in part cannot be voided.
  await repay(page, 'Ali', '100000')
  await page.goto('/entries')
  await page.getByRole('link', { name: /LNR-0001/ }).first().click()
  await page.getByRole('button', { name: 'Void' }).click()
  await page.getByRole('dialog').getByLabel('Reason').fill('Mistake')
  await page.getByRole('dialog').getByRole('button', { name: 'Void entry' }).click()
  await expect(page.getByText(/repaid more than the loans on record/)).toBeVisible()
})

test('repaying to exactly zero moves the lender to Settled', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'settled')
  await borrow(page, 'Bilal', '100000')
  await repay(page, 'Bilal', '100000')
  await page.goto('/loans')
  await expect(page.getByTestId('loans-owed')).toHaveText('Rs 0')
  await expect(page.getByTestId('lender-list')).toHaveCount(0)
  await expect(page.getByTestId('lender-settled')).toContainText('Bilal')
})

test('a viewer sees loans but cannot record or change anything', async ({ browser }) => {
  test.slow() // two sign-ups plus an invitation
  const owner = await (await browser.newContext()).newPage()
  await newBusiness(owner, 'loanview')
  await borrow(owner, 'Ali', '1000')

  const viewerEmail = `viewer-${unique()}@e2e.local`
  await owner.goto('/settings/members')
  await owner.getByRole('button', { name: 'Invite' }).click()
  await owner.getByLabel('Email').fill(viewerEmail)
  await owner.getByLabel('Role', { exact: true }).selectOption('viewer')
  await owner.getByRole('button', { name: 'Create invitation' }).click()
  const link = (await owner.getByTestId('invite-link').textContent())!.trim()

  const viewer = await (await browser.newContext()).newPage()
  await viewer.setViewportSize({ width: 1280, height: 900 })
  await viewer.goto(link)
  await viewer.getByLabel('Password').fill(PASSWORD)
  await viewer.getByRole('button', { name: 'Create account' }).click()
  await expect(viewer.getByTestId('total-cash')).toBeVisible({ timeout: SIGN_UP_TIMEOUT })
  await viewer.goto('/loans')
  await expect(viewer.getByTestId('loans-owed')).toHaveText('Rs 1,000')
  await expect(viewer.getByRole('link', { name: 'Loan received' })).toHaveCount(0)
  await expect(viewer.getByRole('link', { name: 'Loan repayment' })).toHaveCount(0)
})

test('phone: Loans and a lender page have no sideways scroll', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'loanphone')
  await borrow(page, 'Ali with a rather long name for a small screen', '2500000')
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/loans')
  await expect(page.getByTestId('lender-card')).toBeVisible()
  await expectNoHorizontalScroll(page, '/loans')
  await page.getByTestId('lender-card').click()
  await expect(page.getByTestId('loan-statement-list')).toBeVisible()
  await expectNoHorizontalScroll(page, 'a lender page')
})

test('Loans is in the menu and on the More page', async ({ page }) => {
  await newBusiness(page, 'loannav')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Loans' }).click()
  await expect(page.getByRole('heading', { name: 'Loans', level: 1 })).toBeVisible()
  await expect(page.getByText('No loans yet')).toBeVisible()
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/more')
  await expect(page.getByRole('link', { name: 'Loans' })).toBeVisible()
})
