import { expect, type Page, test } from '@playwright/test'
import { choose, expectNoHorizontalScroll, newBusiness, openingBalances, review, save } from './helpers'

// Spec 002 (dashboard v2). Dates use the org's calendar (Asia/Karachi), as in leases.spec.ts.
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
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
}

async function addParty(page: Page, name: string, role: string) {
  await page.goto('/parties')
  await page.getByRole('button', { name: 'Add party' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByLabel(role, { exact: true }).check()
  await dialog.getByRole('button', { name: 'Add party' }).click()
  await expect(dialog).toBeHidden()
}

test('figures agree with the income statement; chart, table view and range; phone width in both themes', async ({ page }) => {
  test.slow() // builds a small scenario through the UI
  await newBusiness(page, 'dash')
  await openingBalances(page, { 'Cash in Hand': '5,000,000' })
  await addProperty(page, 'SHOP-9')
  await addParty(page, 'Seller S', 'Seller')
  await addParty(page, 'Buyer B', 'Buyer')
  await addParty(page, 'Tenant T', 'Tenant')

  // Buy and sell a plot (profit 500,000), and receive 50,000 rent on the shop.
  await page.goto('/new/purchase')
  await page.getByRole('button', { name: 'New property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('PL-1')
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByLabel('Seller', { exact: true }).selectOption({ label: 'Seller S' })
  await page.getByLabel('Purchase price').fill('1000000')
  await page.getByLabel('Paid now').fill('1000000')
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await review(page)
  await save(page)

  await page.goto('/new/sale')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'PL-1' })
  await page.getByLabel('Buyer', { exact: true }).selectOption({ label: 'Buyer B' })
  await page.getByLabel('Sale price').fill('1500000')
  await page.getByLabel('Received now').fill('1500000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await save(page)

  await page.goto('/new/rent')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-9' })
  await page.getByLabel('Tenant', { exact: true }).selectOption({ label: 'Tenant T' })
  await page.getByLabel('Rent received').fill('50000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await save(page)

  // The FY tile equals the income statement's net profit.
  await page.goto('/reports/income-statement')
  await expect(page.getByTestId('is-net')).toContainText('Rs 550,000')
  await page.goto('/')
  await expect(page.getByTestId('profit-fy')).toHaveText('Rs 550,000')
  await expect(page.getByTestId('profit-month')).toHaveText('Rs 550,000')
  await expect(page.getByTestId('total-cash')).toHaveText('Rs 5,550,000')

  // Chart, and the same numbers as a table (the accessible and printed view).
  await expect(page.getByTestId('performance-chart')).toBeVisible()
  await page.getByRole('button', { name: 'Show as table' }).click()
  const table = page.getByTestId('performance-table')
  await expect(table.locator('tbody tr')).toHaveCount(12)
  await expect(table.locator('tbody tr').first()).toContainText('Rs 550,000')

  // Range: 6 months survives a reload (kept in the URL).
  await page.getByRole('button', { name: '6 months' }).click()
  await expect(page).toHaveURL(/range=6/)
  await page.reload()
  await expect(page.getByRole('button', { name: '6 months' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Show as table' }).click()
  await expect(page.getByTestId('performance-table').locator('tbody tr')).toHaveCount(6)

  // Phone width: no sideways scroll once real content has loaded, light and dark.
  await page.setViewportSize({ width: 375, height: 812 })
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await expect(page.getByTestId('performance-chart')).toBeVisible()
    await expect(page.getByTestId('recent-entries')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Range' })).toHaveCount(0) // phones always show 6 months
    await expectNoHorizontalScroll(page, `dashboard (${colorScheme})`)
  }
})

test('rent overdue shows in the tile and Needs attention, and portfolio counts open the register', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'dash')
  await addProperty(page, 'SHOP-4')
  await addParty(page, 'Tenant X', 'Tenant')

  // A lease from the 1st two months ago, rent due on the 1st: three months due, none paid.
  await page.goto('/leases')
  await page.getByRole('button', { name: 'New lease' }).click()
  const dialog = page.getByRole('dialog', { name: 'New lease' })
  await dialog.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await dialog.getByLabel('Tenant', { exact: true }).selectOption({ label: 'Tenant X' })
  await dialog.getByLabel('Start date').fill(twoMonthsBack())
  await dialog.getByLabel('Rent per month').fill('50,000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'SHOP-4 · Tenant X' })).toBeVisible()
  const leaseUrl = page.url()

  await page.goto('/')
  await expect(page.getByTestId('rent-overdue')).toHaveText('Rs 150,000')
  await expect(page.getByText('1 tenant · 3 months unpaid')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Rent overdue/ })).toHaveAttribute('aria-selected', 'true')
  const row = page.getByTestId('overdue-rent').getByRole('link', { name: /SHOP-4 · Tenant X/ })
  await expect(row).toContainText('Rs 150,000')
  await expect(row).toContainText('nothing received yet')
  await row.click()
  await expect(page).toHaveURL(leaseUrl)

  // Portfolio: the rented count opens the register filtered to rented properties.
  await page.goto('/')
  await expect(page.getByTestId('portfolio-rented').getByText('1', { exact: true })).toBeVisible()
  await expect(page.getByTestId('portfolio-vacant').getByText('0', { exact: true })).toBeVisible()
  await page.getByTestId('portfolio-rented').click()
  await expect(page).toHaveURL(/\/properties\?status=rented/)
  await expect(page.getByText('SHOP-4').filter({ visible: true }).first()).toBeVisible()

  // Keyboard: arrow keys move between the attention tabs.
  await page.goto('/')
  await page.getByRole('tab', { name: /Rent overdue/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /Leases ending/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: /Leases ending/ })).toBeFocused()
})
