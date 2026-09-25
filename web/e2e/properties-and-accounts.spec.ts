import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, newBusiness } from './helpers'

test('add a property, list it for sale, and find it with the "For sale" filter', async ({ page }) => {
  await newBusiness(page, 'prop')
  await page.goto('/properties')
  await expect(page.getByText('No properties yet')).toBeVisible()

  await page.getByRole('button', { name: 'Add property' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Code').fill('DP-25')
  await dialog.getByLabel('Type').selectOption('house')
  await dialog.getByLabel('Name (optional)').fill('Defence Phase 5')
  await dialog.getByLabel('Area (optional)').fill('10')
  await dialog.getByRole('button', { name: 'Add property' }).click()

  // Lands on the property page, vacant, with zero history.
  await expect(page.getByRole('heading', { name: 'DP-25 · Defence Phase 5' })).toBeVisible()
  await expect(page.getByText('Vacant', { exact: true })).toBeVisible()
  await expect(page.getByTestId('kpi-cost')).toHaveText('Rs 0')
  await expect(page.getByText('No entries yet')).toBeVisible()

  await page.getByRole('button', { name: 'List for sale' }).click()
  await page.getByLabel(/Asking price/).fill('15,000,000')
  await page.getByRole('dialog').getByRole('button', { name: 'List for sale' }).click()
  await expect(page.getByTestId('asking-price')).toHaveText('Asking Rs 15,000,000')

  await page.getByRole('link', { name: 'Properties' }).first().click()
  await page.getByRole('button', { name: /^For sale/ }).click()
  await expect(page.getByTestId('property-table')).toContainText('DP-25')
  await page.getByRole('button', { name: /^Sold/ }).click()
  await expect(page.getByText('No properties match these filters')).toBeVisible()

  // Codes are unique per business, ignoring case.
  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('dp-25')
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Another property already uses this code.')
})

test('add a party with two roles and filter by role', async ({ page }) => {
  await newBusiness(page, 'party')
  await page.goto('/parties')
  await page.getByRole('button', { name: 'Add party' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill('Ali Raza')
  await dialog.getByLabel('Seller').check()
  await dialog.getByLabel('Buyer').check()
  await dialog.getByLabel('CNIC (optional)').fill('3520212345671')
  await dialog.getByRole('button', { name: 'Add party' }).click()

  await expect(page.getByRole('heading', { name: 'Ali Raza' })).toBeVisible()
  await expect(page.getByText('35202-1234567-1')).toBeVisible()

  await page.goto('/parties')
  await page.getByRole('button', { name: 'Tenant', exact: true }).click()
  await expect(page.getByText('No parties match these filters')).toBeVisible()
  await page.getByRole('button', { name: 'Buyer', exact: true }).click()
  await expect(page.getByTestId('party-list')).toContainText('Ali Raza')
})

test('add a bank account and an expense head', async ({ page }) => {
  await newBusiness(page, 'acct')
  await expect(page.getByText('Add your bank accounts')).toBeVisible()

  await page.goto('/settings/accounts/money')
  await page.getByRole('button', { name: 'Add account' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Kind').selectOption('bank')
  await dialog.getByLabel('Name', { exact: true }).fill('Meezan Current')
  await dialog.getByLabel('Bank (optional)').fill('Meezan Bank')
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByTestId('money-accounts')).toContainText('Meezan Current')
  await expect(page.getByTestId('money-accounts')).toContainText('1101')

  // Shows on the dashboard; the "add bank" hint is gone.
  await page.goto('/')
  await expect(page.getByTestId('balance-1101')).toContainText('Meezan Current')
  await expect(page.getByText('Add your bank accounts')).toHaveCount(0)

  // A zero-balance account can be hidden; system accounts (Cash in Hand) cannot.
  await page.goto('/settings/accounts/money')
  await page.getByRole('button', { name: 'Hide Meezan Current' }).click()
  await expect(page.getByTestId('money-accounts')).toContainText('Hidden')
  await expect(page.getByRole('button', { name: 'Hide Cash in Hand' })).toHaveCount(0)

  await page.goto('/settings/accounts')
  await page.getByRole('button', { name: 'Add head' }).click()
  await page.getByRole('dialog').getByLabel('Kind').selectOption('property_expense')
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Generator fuel')
  await page.getByRole('dialog').getByRole('button', { name: 'Add head' }).click()
  await expect(page.getByTestId('coa-expense')).toContainText('6040')
  await expect(page.getByTestId('coa-expense')).toContainText('Generator fuel')
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('register shows cards and no page scrolls sideways', async ({ page }) => {
    await newBusiness(page, 'mob')
    await page.goto('/properties')
    await page.getByRole('button', { name: 'Add property' }).click()
    await page.getByRole('dialog').getByLabel('Code').fill('SHOP-4')
    await page.getByRole('dialog').getByLabel('Type').selectOption('shop')
    await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
    await expect(page.getByRole('heading', { name: 'SHOP-4' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'property page')

    await page.goto('/properties')
    await expect(page.getByTestId('property-cards')).toContainText('SHOP-4')
    await expect(page.getByTestId('property-table')).toBeHidden()
    // Wait for real content before measuring: an empty loading state never overflows.
    const pages: [string, string][] = [
      ['/properties', 'property-cards'],
      ['/settings/accounts', 'coa-expense'],
      ['/settings/accounts/money', 'money-accounts'],
    ]
    for (const [path, ready] of pages) {
      await page.goto(path)
      await expect(page.getByTestId(ready)).toBeVisible()
      await expectNoHorizontalScroll(page, path)
    }
    await page.goto('/parties')
    await expect(page.getByText('No parties yet')).toBeVisible()
    await expectNoHorizontalScroll(page, '/parties')
  })
})
