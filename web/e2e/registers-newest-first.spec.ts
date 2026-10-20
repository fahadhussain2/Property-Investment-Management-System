import { expect, test, type Page } from '@playwright/test'
import { newBusiness, orgDate } from './helpers'

// Product owner, 2026-10-21: a register shows its newest entry first on screen, with the opening balance at the
// bottom; print and CSV keep the register's own order (opening balance, then oldest first).

async function addEntry(page: Page, date: string, description: string, amount: string) {
  await page.getByRole('button', { name: 'Add entry' }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Date').fill(date)
  await d.getByLabel('Description').fill(description)
  await d.getByLabel('Money out').check()
  await d.getByLabel(/^Amount/).fill(amount)
  await d.getByRole('button', { name: 'Add entry' }).click()
  await expect(d).toBeHidden()
}

const texts = (page: Page, id: string) =>
  page.getByTestId(id).locator(':scope > table > tbody > tr, :scope > li').evaluateAll((els) =>
    els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )

test('newest entry first on screen, oldest first on paper; balances unchanged', async ({ page }) => {
  await newBusiness(page, 'regorder')
  await page.goto('/registers')
  await page.getByRole('button', { name: 'Add register' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Zakat Fund')
  await page.getByRole('dialog').getByLabel(/Opening balance/).fill('10,000')
  await page.getByRole('dialog').getByRole('button', { name: 'Add register' }).click()
  await expect(page.getByRole('heading', { name: 'Zakat Fund', level: 1 })).toBeVisible()

  // Entered out of date order on purpose: the order follows the dates, not the typing.
  await addEntry(page, orgDate(-10), 'Second', '2,000')
  await addEntry(page, orgDate(-20), 'First', '1,000')
  await addEntry(page, orgDate(-1), 'Third', '3,000')
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 4,000')
  await expect(page.getByText('Newest first.')).toBeVisible()

  // Desktop table: Third, Second, First, then the opening balance; each line keeps its own balance.
  await page.setViewportSize({ width: 1280, height: 900 })
  const desk = await texts(page, 'register-ledger')
  expect(desk.map((t) => t.match(/Third|Second|First|Opening balance/)?.[0])).toEqual(['Third', 'Second', 'First', 'Opening balance'])
  expect(desk[0]).toContain('Rs 4,000')
  expect(desk[2]).toContain('Rs 9,000')

  // Phones: the same order.
  await page.setViewportSize({ width: 375, height: 800 })
  const phone = await texts(page, 'register-ledger-list')
  expect(phone.map((t) => t.match(/Third|Second|First|Opening balance/)?.[0])).toEqual(['Third', 'Second', 'First', 'Opening balance'])

  // Printing: the browser announces it with beforeprint; the paper copy starts at the opening balance.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  const paper = await texts(page, 'register-ledger')
  expect(paper.map((t) => t.match(/Third|Second|First|Opening balance/)?.[0])).toEqual(['Opening balance', 'First', 'Second', 'Third'])
  await expect(page.getByText('Newest first.')).toBeHidden()
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  const back = await texts(page, 'register-ledger')
  expect(back[0]).toContain('Third')

  // CSV keeps the register's own order.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  const { readFileSync } = await import('node:fs')
  const rows = readFileSync((await download.path())!, 'utf8').split(/\r?\n/).slice(1).map((r) => r.split(',')[1])
  expect(rows).toEqual(['Opening balance', 'First', 'Second', 'Third'])
})
