import { expect, test, type Page } from '@playwright/test'
import { addBank, expectNoHorizontalScroll, newBusiness, openingBalances } from './helpers'

// Spec 005 amendment 4: separate Cash and Bank tiles, each with its total, account count and 6-month trend line;
// five key figures in one row from 1536 px, 3 + 2 below that. And the party statement prints on its own.

const figures = (page: Page) => page.getByRole('region', { name: 'Key figures' })

/** Spare width beside a tile's figure if it were on one line (text renders a few px wider on some systems, CI). */
const room = (page: Page, testid: string) =>
  page.getByTestId(testid).evaluate((el) => {
    const probe = el.cloneNode(true) as HTMLElement
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
    el.parentElement!.appendChild(probe)
    const needed = probe.getBoundingClientRect().width
    probe.remove()
    return el.parentElement!.clientWidth - needed
  })

test('Cash and Bank are separate tiles with trend lines, five in a row on wide screens', async ({ page }) => {
  await newBusiness(page, 'cashbank')
  await addBank(page, 'Meezan')
  await openingBalances(page, { 'Cash in Hand': '9,550,000', Meezan: '125,000,000' })

  await page.goto('/')
  await expect(page.getByTestId('cash-total')).toHaveText('Rs 9,550,000')
  await expect(page.getByTestId('bank-total')).toHaveText('Rs 125,000,000')
  // Cash and bank together stay on the dashboard, in Cash by account.
  await expect(page.getByTestId('total-cash')).toHaveText('Rs 134,550,000')
  const tiles = figures(page).locator(':scope > div > div')
  await expect(tiles).toHaveCount(5)
  await expect(tiles.nth(0)).toContainText('1 account')
  await expect(tiles.nth(1)).toContainText('1 account')
  await expect(figures(page).locator('[data-icon="wallet"]')).toHaveCount(1)
  await expect(figures(page).locator('[data-icon="credit-card"]')).toHaveCount(1)

  // Each tile has its own trend line.
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByTestId('cash-trend').locator('polyline')).toHaveCount(1)
  await expect(page.getByTestId('bank-trend').locator('polyline')).toHaveCount(1)

  const tops = () => tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  // 1024 to 1535 px: Cash, Bank and Net profit, then Total invested and Rent overdue.
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const t = await tops()
    expect(new Set(t.slice(0, 3)).size, `first row at ${width} px`).toBe(1)
    expect(t[3], `second row at ${width} px`).toBeGreaterThan(t[0])
    expect(t[4]).toBe(t[3])
  }
  // From 1536 px: all five in one row, and a 12-crore figure still fits on one line with room to spare.
  for (const width of [1536, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    expect(new Set(await tops()).size, `one row at ${width} px`).toBe(1)
  }
  for (const width of [1280, 1440, 1536, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    for (const id of ['cash-total', 'bank-total']) expect(await room(page, id), `${id} at ${width} px`).toBeGreaterThanOrEqual(16)
  }

  // Phones: two tiles side by side, the trend lines hidden (no room beside the account count), no sideways scroll.
  await page.setViewportSize({ width: 375, height: 800 })
  await expect(page.getByTestId('bank-total')).toBeVisible()
  await expect(page.getByTestId('cash-trend')).toBeHidden()
  await expectNoHorizontalScroll(page, 'dashboard with Cash and Bank tiles')
})

test('a business without a bank account sees Rs 0 and "No accounts yet" on the Bank tile', async ({ page }) => {
  await newBusiness(page, 'nobank')
  await expect(page.getByTestId('bank-total')).toHaveText('Rs 0')
  await expect(figures(page).locator(':scope > div > div').nth(1)).toContainText('No accounts yet')
  await expect(figures(page).locator(':scope > div > div').nth(0)).toContainText('1 account')
})

test('a party statement has a Print button and prints only the statement', async ({ page }) => {
  await newBusiness(page, 'partyprint')
  await page.goto('/parties')
  await page.getByRole('button', { name: 'Add party' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Seller P')
  await page.getByRole('dialog').getByLabel('Seller', { exact: true }).check()
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('heading', { name: 'Seller P', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible()

  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('heading', { name: 'Statement · Seller P' })).toBeVisible()
  await expect(page.getByTestId('party-net')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Seller P', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Details' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Entries' })).toBeHidden()
})
