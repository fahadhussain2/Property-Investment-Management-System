import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, newBusiness } from './helpers'

// Product owner, 2026-10-06: on /new, Money in & out comes first (where Properties was) and Properties takes its
// place under Rent; each group's box has a light but visible outline.

test('New entry: Money in & out first, Properties under Rent, groups outlined', async ({ page }) => {
  await newBusiness(page, 'neworder')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/new')
  const headings = page.locator('main section h2')
  await expect(headings).toHaveText(['Money in & out', 'Vehicles, gold & silver', 'Rent', 'Properties', 'Setup & corrections'])

  // Two columns: Money in & out over Vehicles on the left; Rent, Properties and Setup on the right.
  const box = (name: string) => page.getByRole('region', { name }).boundingBox()
  const [money, vehicles, rent, properties, setup] = await Promise.all(
    ['Money in & out', 'Vehicles, gold & silver', 'Rent', 'Properties', 'Setup & corrections'].map(box),
  )
  expect(vehicles!.x).toBe(money!.x)
  expect(rent!.x).toBeGreaterThan(money!.x)
  expect(rent!.y).toBe(money!.y)
  expect(properties!.x).toBe(rent!.x)
  expect(properties!.y).toBeGreaterThan(rent!.y)
  expect(setup!.y).toBeGreaterThan(properties!.y)

  // The group's outline is stronger than the default hairline (the rows' dividers).
  const list = page.getByRole('region', { name: 'Money in & out' }).getByRole('list')
  const [outline, divider] = await list.evaluate((ul) => [
    getComputedStyle(ul).borderTopColor,
    getComputedStyle(ul.querySelector('li + li')!).borderTopColor,
  ])
  expect(outline).not.toBe(divider)

  await page.setViewportSize({ width: 375, height: 800 })
  await expectNoHorizontalScroll(page, 'new entry')
})
