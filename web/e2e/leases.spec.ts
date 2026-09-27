import { expect, type Page, test } from '@playwright/test'
import { choose, expectNoHorizontalScroll, newBusiness, openingBalances, review, save } from './helpers'

// The org's calendar date (default timezone Asia/Karachi, see org_today()), not the test
// runner's local/UTC clock: near midnight UTC the two disagree on "today" by a day.
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
const daysFromToday = (n: number) => ymd(new Date(Date.now() + n * 86_400_000))
/** The 1st of the month two months ago: rent due on the 1st gives exactly 3 months due today. */
const twoMonthsBack = () => {
  const d = new Date()
  return ymd(new Date(d.getFullYear(), d.getMonth() - 2, 1))
}

async function addProperty(page: Page, code: string) {
  await page.goto('/properties')
  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill(code)
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('heading', { name: code })).toBeVisible()
  return page.url()
}

test('lease lifecycle: add lease → rented → rent roll shows months unpaid → record and correct rent → end lease → vacant', async ({ page }) => {
  test.slow() // a long multi-screen flow
  await newBusiness(page, 'lease')
  await openingBalances(page, { 'Cash in Hand': '1,000,000' })
  const propertyUrl = await addProperty(page, 'SHOP-4')
  await expect(page.getByText('Vacant', { exact: true })).toBeVisible()

  // New lease from the rent roll, creating the tenant on the spot.
  await page.goto('/leases')
  await expect(page.getByRole('heading', { name: 'Leases & Rent' })).toBeVisible()
  await page.getByRole('button', { name: 'New lease' }).click()
  const dialog = page.getByRole('dialog', { name: 'New lease' })
  await dialog.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await dialog.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').last().getByLabel('Name', { exact: true }).fill('Tenant X')
  await page.getByRole('dialog').last().getByRole('button', { name: 'Add party' }).click()
  await expect(dialog.getByLabel('Tenant', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await dialog.getByLabel('Start date').fill(twoMonthsBack())
  await dialog.getByLabel('Rent per month').fill('50,000')
  await dialog.getByLabel('Security deposit (optional)').fill('100,000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()

  // Lease page: three months due, none paid.
  await expect(page.getByRole('heading', { name: 'SHOP-4 · Tenant X' })).toBeVisible()
  const leaseUrl = page.url()
  await expect(page.getByTestId('kpi-unpaid')).toHaveText('Rs 150,000 · 3 mo')
  await expect(page.getByTestId('lease-status')).toContainText('3 months unpaid')

  // The property is rented automatically.
  await page.goto(propertyUrl)
  await expect(page.getByText('Rented', { exact: true })).toBeVisible()
  await expect(page.getByTestId('lease-SHOP-4')).toContainText('3 months unpaid')

  // Record rent from the lease: lease and amount come prefilled.
  await page.goto(leaseUrl)
  await page.getByRole('link', { name: 'Record rent' }).click()
  await expect(page.getByLabel('Lease', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await expect(page.getByLabel('Rent received')).toHaveValue('50000.00')
  await expect(page.getByText('3 months unpaid (Rs 150,000)')).toBeVisible()
  await expect(page.getByLabel('Property', { exact: true })).toHaveCount(0) // the lease fixes property and tenant
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await expect(page.getByTestId('entry-summary')).toContainText('SHOP-4')
  await expect(page.getByTestId('entry-summary')).toContainText('Tenant X')
  await save(page)

  await page.goto(leaseUrl)
  await expect(page.getByTestId('kpi-unpaid')).toHaveText('Rs 100,000 · 2 mo')

  // Correct that rent to two months: the correction keeps the lease.
  await page.getByTestId('voucher-list').getByRole('link').first().click()
  await page.getByRole('link', { name: 'Correct' }).click()
  await expect(page.getByLabel('Lease', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await page.getByLabel('Rent received').fill('100000')
  await review(page)
  await save(page, 'Save correction')
  await page.goto(leaseUrl)
  await expect(page.getByTestId('kpi-unpaid')).toHaveText('Rs 50,000 · 1 mo')
  await expect(page.getByTestId('kpi-received')).toContainText('Rs 100,000')

  // A second lease on the same property for overlapping dates is refused in plain words.
  await page.goto('/leases')
  await page.getByRole('button', { name: 'New lease' }).click()
  await dialog.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await dialog.getByLabel('Tenant', { exact: true }).selectOption({ label: 'Tenant X' })
  await dialog.getByLabel('Rent per month').fill('60000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(dialog.getByRole('alert')).toContainText('already has a lease for these dates')
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 375, height: 800 })
  await expect(page.getByTestId('rent-roll')).toContainText('1 month unpaid')
  await expect(page.getByTestId('roll-arrears')).toHaveText('Rs 50,000')
  await expectNoHorizontalScroll(page, '/leases')
  await page.goto(leaseUrl)
  await expect(page.getByTestId('kpi-unpaid')).toBeVisible()
  await expectNoHorizontalScroll(page, 'lease page')
  await page.setViewportSize({ width: 1280, height: 800 })

  // End the lease (tenant left yesterday): the property is vacant again, the lease moves to "Ended".
  await page.getByRole('button', { name: 'End lease' }).click()
  await page.getByRole('dialog').getByLabel('Tenant left on').fill(daysFromToday(-1))
  await page.getByRole('dialog').getByRole('button', { name: 'End lease' }).click()
  await expect(page.getByTestId('lease-status')).toContainText('Ended')
  await expect(page.getByTestId('kpi-unpaid')).toHaveText('Rs 50,000 · 1 mo') // what's unpaid stays unpaid

  await page.goto(propertyUrl)
  await expect(page.getByText('Vacant', { exact: true })).toBeVisible()
  await page.goto('/leases')
  await expect(page.getByTestId('rent-roll')).toHaveCount(0)
  await page.getByRole('tab', { name: 'Ended' }).click()
  await expect(page.getByTestId('lease-SHOP-4')).toBeVisible()
})

test('a lease ending soon shows on the dashboard; added from the property page', async ({ page }) => {
  await newBusiness(page, 'expiry')
  await addProperty(page, 'FLAT-7')
  await page.getByRole('button', { name: 'Add lease' }).click()
  const dialog = page.getByRole('dialog', { name: 'New lease' })
  await expect(dialog.getByLabel('Property', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await dialog.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').last().getByLabel('Name', { exact: true }).fill('Tenant Y')
  await page.getByRole('dialog').last().getByRole('button', { name: 'Add party' }).click()
  await expect(dialog.getByLabel('Tenant', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await dialog.getByLabel('End date (optional)').fill(daysFromToday(20))
  await dialog.getByLabel('Rent per month').fill('30000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'FLAT-7 · Tenant Y' })).toBeVisible()

  await page.goto('/')
  await expect(page.getByTestId('expiring-leases')).toContainText('FLAT-7')
  await expect(page.getByTestId('expiring-leases')).toContainText('in 20 days')
})
