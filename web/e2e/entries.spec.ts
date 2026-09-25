import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoHorizontalScroll, newBusiness, PASSWORD, unique } from './helpers'

/** Picks the option whose text contains `text` (money-account options include a live balance). */
async function choose(select: Locator, text: string) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value')
  await select.selectOption(value!)
}

async function addBank(page: Page, name: string) {
  await page.goto('/settings/accounts/money')
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByTestId('money-accounts')).toContainText(name)
}

async function openingBalances(page: Page, amounts: Record<string, string>) {
  await page.goto('/new')
  await page.getByRole('link', { name: /Opening balances/ }).click()
  for (const [account, amount] of Object.entries(amounts)) await page.getByLabel(account, { exact: true }).fill(amount)
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByTestId('entry-preview')).toContainText('Opening Balance Equity')
  await page.getByRole('button', { name: 'Save opening balances' }).click()
  await expect(page.getByTestId('total-cash')).toBeVisible()
}

/** Fills and saves an entry form; returns after landing on the saved entry page. */
async function review(page: Page) {
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByTestId('entry-preview')).toBeVisible()
}
async function save(page: Page, label = 'Save entry') {
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(/\/entries\/[0-9a-f-]{36}$/)
}

test('acceptance scenario 1 through the UI: buy on credit, add costs, sell, profit shown automatically', async ({ page }) => {
  test.slow() // a long multi-screen flow; needs more than the default 30 s when run in parallel
  await newBusiness(page, 'flow')
  await addBank(page, 'Meezan')
  await openingBalances(page, { Meezan: '20,000,000', 'Cash in Hand': '1,000,000' })
  await expect(page.getByTestId('total-cash')).toHaveText('Rs 21,000,000')

  // Bought DP-25, creating the property and the seller on the spot.
  await page.goto('/new/purchase')
  await page.getByRole('button', { name: 'New property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('DP-25')
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByLabel('Property', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await page.getByRole('button', { name: 'New seller' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Seller A')
  await expect(page.getByRole('dialog').getByLabel('Seller')).toBeChecked()
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByLabel('Seller', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await page.getByLabel('Purchase price').fill('10000000')
  await expect(page.getByText('Rs 10,000,000 · 1 crore')).toBeVisible()
  await page.getByLabel('Paid now').fill('4000000')
  await choose(page.getByLabel('Paid from'), 'Meezan')
  await review(page)
  await expect(page.getByTestId('entry-summary')).toHaveText(
    'Bought DP-25 from Seller A for Rs 10,000,000. Paid Rs 4,000,000 now from Meezan. Rs 6,000,000 still owed to the seller.',
  )
  await save(page)
  await expect(page.getByRole('heading', { name: 'Property purchase · PUR-0001' })).toBeVisible()

  // Transfer fee from cash, then the seller's balance from the bank.
  await page.goto('/new/property_cost')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'DP-25' })
  await page.getByLabel('Amount').fill('200000')
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await page.getByLabel('What for?').fill('Transfer fee')
  await review(page)
  await save(page)

  await page.goto('/new/pay_seller')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'DP-25' })
  await page.getByLabel('Seller', { exact: true }).selectOption({ label: 'Seller A' })
  await page.getByLabel('Amount').fill('6000000')
  await choose(page.getByLabel('Paid from'), 'Meezan')
  await review(page)
  await save(page)

  // Sold: the profit is worked out and shown before saving.
  await page.goto('/new/sale')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'DP-25' })
  await page.getByRole('button', { name: 'New buyer' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Buyer B')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await page.getByLabel('Sale price').fill('12,500,000')
  await page.getByLabel('Received now').fill('12,500,000')
  await choose(page.getByLabel('Received into'), 'Meezan')
  await review(page)
  await expect(page.getByTestId('sale-profit')).toContainText('Profit on this sale: Rs 2,300,000')
  await expect(page.getByTestId('sale-profit')).toContainText('Total cost of the property: Rs 10,200,000')
  await save(page)
  await expect(page.getByTestId('sale-profit')).toContainText('Rs 2,300,000')

  // Regression (M4 review): correcting a sale used to fail with "already sold". The price was really 13m.
  await page.getByRole('link', { name: 'Correct' }).click()
  await page.getByLabel('Sale price').fill('13,000,000')
  await page.getByLabel('Received now').fill('13,000,000')
  await review(page)
  await expect(page.getByTestId('sale-profit')).toContainText('Profit on this sale: Rs 2,800,000')
  await expect(page.getByText('Accounting entries (will be SAL-0003)')).toBeVisible()
  await save(page, 'Save correction')
  await expect(page.getByRole('heading', { name: 'Property sale · SAL-0003' })).toBeVisible()
  await expect(page.getByTestId('sale-profit')).toContainText('Rs 2,800,000')

  // The property's history and the bank balance agree.
  await page.getByRole('link', { name: 'DP-25' }).click()
  await expect(page.getByText('Sold', { exact: true })).toBeVisible()
  await expect(page.getByTestId('kpi-cost')).toHaveText('Rs 10,200,000')
  await expect(page.getByTestId('kpi-profit')).toHaveText('Rs 2,800,000')
  // Purchase, transfer fee, seller payment, sale, its reversal and the corrected sale.
  // The opening entry is not tied to a property.
  await expect(page.getByTestId('voucher-list').locator('li')).toHaveCount(6)
  await page.goto('/')
  await expect(page.getByTestId('balance-1101')).toContainText('Rs 23,000,000')
  await expect(page.getByTestId('balance-1000')).toContainText('Rs 800,000')
})

test('rent: record, correct, void, with a full trail in the day book', async ({ page }) => {
  test.slow() // a long multi-screen flow; needs more than the default 30 s when run in parallel
  await newBusiness(page, 'rent')
  await page.goto('/properties')
  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('SHOP-4')
  await page.getByRole('dialog').getByLabel('Type').selectOption('shop')
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('heading', { name: 'SHOP-4' })).toBeVisible()
  const propertyUrl = page.url()

  await page.goto('/new/rent')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await page.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Tenant X')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await page.getByLabel('Rent received').fill('50000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await save(page)
  await expect(page.getByRole('heading', { name: 'Rent received · RNT-0001' })).toBeVisible()

  // Correct 50,000 → 55,000: the form comes back filled in.
  await page.getByRole('link', { name: 'Correct' }).click()
  await expect(page.getByLabel('Rent received')).toHaveValue('50000.00')
  await page.getByLabel('Rent received').fill('55000')
  await review(page)
  await save(page, 'Save correction')
  await expect(page.getByRole('heading', { name: 'Rent received · RNT-0003' })).toBeVisible()
  await expect(page.getByTestId('entry-links')).toContainText('Correction of RNT-0001')
  await page.goto(propertyUrl)
  await expect(page.getByTestId('kpi-rent')).toHaveText('Rs 55,000')

  // Void it.
  await page.getByTestId('voucher-list').getByText('RNT-0003').click()
  await page.getByRole('button', { name: 'Void' }).click()
  await page.getByRole('dialog').getByLabel('Reason').fill('Entered by mistake')
  await page.getByRole('dialog').getByRole('button', { name: 'Void entry' }).click()
  await expect(page.locator('[data-slot=badge]', { hasText: 'Voided' })).toBeVisible()
  await expect(page.getByTestId('entry-history')).toContainText('Entered by mistake')
  await page.goto(propertyUrl)
  await expect(page.getByTestId('kpi-rent')).toHaveText('Rs 0')

  await page.goto('/entries')
  for (const n of ['RNT-0001', 'RNT-0002', 'RNT-0003', 'RNT-0004']) {
    await expect(page.getByTestId('entries-list')).toContainText(n)
  }
})

test('bank withdrawal, cash expense, and a balanced journal entry', async ({ page }) => {
  test.slow() // a long multi-screen flow; needs more than the default 30 s when run in parallel
  await newBusiness(page, 'cash')
  await addBank(page, 'Meezan')
  await openingBalances(page, { Meezan: '500000' })

  await page.goto('/new/transfer')
  await choose(page.getByLabel('From'), 'Meezan')
  await choose(page.getByLabel('To', { exact: true }), 'Cash in Hand')
  await page.getByLabel('Amount').fill('200000')
  await review(page)
  await expect(page.getByTestId('entry-summary')).toHaveText('Moved Rs 200,000 from Meezan to Cash in Hand.')
  await save(page)

  await page.goto('/new/expense')
  await choose(page.getByLabel('Expense head'), 'Repairs & Maintenance')
  await page.getByLabel('Amount').fill('30000')
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await review(page)
  await save(page)

  await page.goto('/')
  await expect(page.getByTestId('balance-1000')).toContainText('Rs 170,000')
  await expect(page.getByTestId('balance-1101')).toContainText('Rs 300,000')

  await page.goto('/new/journal')
  await page.getByLabel('Note').fill('Bank charges for January')
  await choose(page.getByLabel('Account, line 1'), 'Bank Charges')
  await page.getByLabel('Debit, line 1').fill('1500')
  await choose(page.getByLabel('Account, line 2'), 'Meezan')
  await page.getByLabel('Credit, line 2').fill('1000')
  await expect(page.getByTestId('journal-totals')).toContainText('Difference Rs 500')
  await expect(page.getByRole('button', { name: 'Review' })).toBeDisabled()
  await page.getByLabel('Credit, line 2').fill('1500')
  await expect(page.getByTestId('journal-totals')).toContainText('Balanced')
  await review(page)
  await save(page)
  await expect(page.getByRole('heading', { name: 'Journal entry · JV-0001' })).toBeVisible()
})

// Regression (M4 review): viewers could open entry forms by URL and only failed on save.
test('a viewer cannot open entry forms, even by typing the address', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  await newBusiness(owner, 'own')
  const viewerEmail = `viewer-${unique()}@e2e.local`
  await owner.goto('/settings/members')
  await owner.getByRole('button', { name: 'Invite' }).click()
  await owner.getByLabel('Email').fill(viewerEmail)
  await owner.getByLabel('Role', { exact: true }).selectOption('viewer')
  await owner.getByRole('button', { name: 'Create invitation' }).click()
  const link = (await owner.getByTestId('invite-link').textContent())!.trim()

  const viewer = await (await browser.newContext()).newPage()
  await viewer.goto(link)
  await viewer.getByLabel('Password').fill(PASSWORD)
  await viewer.getByRole('button', { name: 'Create account' }).click()
  await expect(viewer.getByTestId('total-cash')).toBeVisible()
  await expect(viewer.getByRole('link', { name: 'New entry' })).toHaveCount(0)
  for (const path of ['/new', '/new/purchase', '/new/opening', '/new/journal']) {
    await viewer.goto(path)
    await expect(viewer).toHaveURL(/\/entries$/)
  }
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('record a purchase on a phone without sideways scrolling', async ({ page }) => {
    await newBusiness(page, 'mobent')
    await page.getByTestId('bottom-nav').getByRole('link', { name: 'New' }).click()
    await expect(page.getByRole('heading', { name: 'New entry' })).toBeVisible()
    await expectNoHorizontalScroll(page, '/new')

    await page.getByRole('link', { name: /Bought a property/ }).click()
    await page.getByRole('button', { name: 'New property' }).click()
    await page.getByRole('dialog').getByLabel('Code').fill('PLOT-7')
    await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
    await page.getByLabel('Purchase price').fill('4000000')
    await page.getByLabel('Paid now').fill('4000000')
    await choose(page.getByLabel('Paid from'), 'Cash in Hand')
    await expectNoHorizontalScroll(page, 'purchase form')
    await review(page)
    await page.getByText(/Accounting entries/).click()
    await expect(page.getByTestId('entry-lines')).toBeVisible()
    await expectNoHorizontalScroll(page, 'purchase preview')
    await save(page)
    await expectNoHorizontalScroll(page, 'entry page')
    await page.goto('/entries')
    await expect(page.getByTestId('entries-list')).toContainText('PUR-0001')
    await expectNoHorizontalScroll(page, '/entries')
  })
})
