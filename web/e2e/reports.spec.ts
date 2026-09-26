import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { addBank, choose, expectNoHorizontalScroll, newBusiness, openingBalances, review, save } from './helpers'

test('books and reports reconcile after the DP-25 scenario plus rent', async ({ page }) => {
  test.slow() // builds a full scenario through the UI before checking every report
  await newBusiness(page, 'rep')
  await addBank(page, 'Meezan')
  await openingBalances(page, { Meezan: '20000000', 'Cash in Hand': '1000000' })

  // Buy DP-25 on credit, add a transfer fee, pay the seller, sell.
  await page.goto('/new/purchase')
  await page.getByRole('button', { name: 'New property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('DP-25')
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: 'New seller' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Seller A')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByLabel('Purchase price').fill('10000000')
  await page.getByLabel('Paid now').fill('4000000')
  await choose(page.getByLabel('Paid from'), 'Meezan')
  await review(page)
  await save(page)

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

  await page.goto('/new/sale')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'DP-25' })
  await page.getByRole('button', { name: 'New buyer' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Buyer B')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByLabel('Sale price').fill('12500000')
  await page.getByLabel('Received now').fill('12500000')
  await choose(page.getByLabel('Received into'), 'Meezan')
  await review(page)
  await save(page)

  // A shop earning rent.
  await page.goto('/properties')
  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('SHOP-4')
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('heading', { name: 'SHOP-4' })).toBeVisible()
  await page.goto('/new/rent')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await page.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Tenant X')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByLabel('Rent received').fill('50000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await save(page)

  // Income statement: trading profit, rent by property, total profit; CSV has exact numbers.
  await page.goto('/reports/income-statement')
  await expect(page.getByTestId('is-gross-trading')).toContainText('Rs 2,300,000')
  await expect(page.getByTestId('is-rent')).toContainText('Rs 50,000')
  await page.getByTestId('is-rent').locator('summary').click()
  await expect(page.getByTestId('is-rent-by-property')).toContainText('SHOP-4')
  await expect(page.getByTestId('is-net')).toContainText('Rs 2,350,000')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  const csv = fs.readFileSync((await download.path())!, 'utf8')
  expect(csv).toContain('Gross profit on property trading,2300000.00')
  expect(csv).toContain('Rent income,SHOP-4,50000.00')

  // On paper: app chrome hidden, print header shown.
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeHidden()
  await expect(page.getByText(/Printed /)).toBeVisible()
  // Rent by property must be on paper even though it is collapsible on screen.
  await expect(page.getByTestId('is-rent').getByText('SHOP-4').last()).toBeVisible()
  await page.emulateMedia({ media: 'screen' })

  // Everything reconciles.
  await page.goto('/reports/trial-balance')
  await expect(page.getByTestId('reconcile')).toHaveText('Balanced')
  await page.goto('/reports/balance-sheet')
  await expect(page.getByTestId('reconcile')).toHaveText('Balanced')

  // Bank book: every Meezan movement, closing at 22.5m.
  await page.goto('/money')
  await page.getByTestId('money-list').getByText('Meezan').click()
  await expect(page.getByRole('heading', { name: 'Bank book: Meezan' })).toBeVisible()
  await expect(page.getByTestId('money-book').locator('tbody tr')).toHaveCount(6) // opening + 4 movements + closing
  await expect(page.getByTestId('ledger-closing')).toHaveText('Rs 22,500,000')

  // Property build-up and party statement.
  await page.goto('/properties')
  await page.getByRole('link', { name: 'DP-25' }).first().click()
  await expect(page.getByTestId('property-breakdown')).toContainText('Purchase price')
  await expect(page.getByTestId('property-breakdown')).toContainText('Transfer fee')
  await expect(page.getByTestId('breakdown-cost-total')).toContainText('Rs 10,200,000')
  await expect(page.getByTestId('breakdown-profit')).toContainText('Rs 2,300,000')
  await page.goto('/reports/parties')
  await page.getByLabel('Show parties with nothing outstanding').check()
  await page.getByTestId('party-balances').getByRole('link', { name: 'Seller A' }).click()
  await expect(page.getByTestId('party-net')).toContainText('Settled')
  await expect(page.getByTestId('party-statement').locator('tbody tr')).toHaveCount(4) // opening + credit purchase + payment + closing

  // Dashboard: portfolio and this year's profit.
  await page.goto('/')
  await expect(page.getByTestId('portfolio-sold').getByText('1', { exact: true })).toBeVisible()
  await expect(page.getByTestId('profit-fy')).toHaveText('Rs 2,350,000')
  await expect(page.getByTestId('recent-entries')).toContainText('RNT-0001')

  // Phone width: report pages never scroll sideways (wide tables scroll inside their box).
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/reports', '/reports/income-statement', '/reports/trial-balance', '/reports/balance-sheet', '/reports/properties', '/reports/parties', '/money', '/']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expectNoHorizontalScroll(page, path)
  }
})

// Regression (M5 review): the party page claimed "Settled" while balances were loading or had failed.
test('party page shows an error, never a fake "Settled", when balances fail to load', async ({ page }) => {
  await newBusiness(page, 'pfail')
  await page.goto('/parties')
  await page.getByRole('button', { name: 'Add party' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Ali Raza')
  await page.getByRole('dialog').getByLabel('Seller').check()
  await page.route('**/rest/v1/rpc/party_balances', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"database unavailable"}' }),
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('heading', { name: 'Ali Raza' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load this' }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Settled/)).toHaveCount(0)
})
