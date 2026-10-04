import { expect, test, type Page } from '@playwright/test'
import { addBank, expectNoHorizontalScroll, newBusiness, openingBalances } from './helpers'

// Product owner, 2026-10-04: the Cash and Bank tiles open only their own accounts; /new has no gap under Rent;
// a new page opens at the top, not at the scroll position of the page before it.

const money = (page: Page) => page.getByTestId('money-list')

test('the Cash and Bank tiles open the Cash & Bank page on their own accounts', async ({ page }) => {
  await newBusiness(page, 'moneykind')
  await addBank(page, 'Meezan')
  await openingBalances(page, { 'Cash in Hand': '1,000', Meezan: '2,000' })
  await page.goto('/')
  const figures = page.getByRole('region', { name: 'Key figures' })

  await figures.getByRole('link', { name: 'Cash', exact: true }).click()
  await expect(page).toHaveURL(/\/money\?kind=cash$/)
  await expect(money(page)).toContainText('Cash in Hand')
  await expect(money(page)).not.toContainText('Meezan')
  await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Cash total Rs 1,000')).toBeVisible()

  await page.goto('/')
  await figures.getByRole('link', { name: 'Bank', exact: true }).click()
  await expect(page).toHaveURL(/\/money\?kind=bank$/)
  await expect(money(page)).toContainText('Meezan')
  await expect(money(page)).not.toContainText('Cash in Hand')
  await expect(page.getByText('Bank total Rs 2,000')).toBeVisible()

  // "All" shows both again; the sidebar link still opens all of them.
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page).toHaveURL(/\/money$/)
  await expect(money(page).getByRole('listitem')).toHaveCount(2)
  await expect(page.getByText('Total Rs 3,000')).toBeVisible()
})

test('a kind with no accounts says so instead of an empty list', async ({ page }) => {
  await newBusiness(page, 'nobankkind')
  await page.goto('/money?kind=bank')
  await expect(page.getByTestId('money-empty')).toContainText('No bank accounts yet')
  await expect(money(page)).toHaveCount(0)
})

test('New entry: groups flow in two columns with no gap between them', async ({ page }) => {
  await newBusiness(page, 'newgap')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/new')
  await expect(page.getByRole('heading', { name: 'Setup & corrections' })).toBeVisible()
  const boxes = await page.locator('main section').evaluateAll((els) =>
    els.map((e) => {
      // The list's bottom, not the section's: in a grid row a section stretches to the tallest one beside it.
      const r = e.getBoundingClientRect()
      return { left: Math.round(r.left), top: r.top, bottom: e.querySelector('ul')!.getBoundingClientRect().bottom }
    }),
  )
  const columns = new Map<number, typeof boxes>()
  for (const b of boxes) columns.set(b.left, [...(columns.get(b.left) ?? []), b])
  expect(columns.size, 'two columns').toBe(2)
  for (const col of columns.values()) {
    col.sort((a, b) => a.top - b.top)
    for (let i = 1; i < col.length; i++) expect(col[i].top - col[i - 1].bottom, 'space between groups').toBeLessThanOrEqual(32)
  }
  await page.setViewportSize({ width: 375, height: 800 })
  await expectNoHorizontalScroll(page, 'new entry')
})

test('a new page opens at the top; a filter on the same page keeps the scroll position', async ({ page }) => {
  await newBusiness(page, 'scrolltop')
  await addBank(page, 'Meezan')
  await page.setViewportSize({ width: 1280, height: 500 })
  await page.goto('/')
  await expect(page.getByTestId('bank-total')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Entries' }).click()
  await expect(page.getByRole('heading', { name: 'Entries', level: 1 })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // Same page, different filter (only the URL's ?kind changes): no jump to the top.
  await page.setViewportSize({ width: 375, height: 300 })
  await page.goto('/money?kind=cash')
  await expect(money(page)).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(money(page).getByRole('listitem')).toHaveCount(2)
  expect(await page.evaluate(() => window.scrollY)).toBe(before)
})
