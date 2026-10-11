import { expect, test, type Locator, type Page } from '@playwright/test'
import { choose, newBusiness, review, save } from './helpers'

// Product owner, 2026-10-11 (option B): entries that no longer count stay greyed out and crossed out, with a
// Corrected / Voided / Reversal label (not crossed out) and a red line through the amount.

async function capital(page: Page, amount: string) {
  await page.goto('/new/capital')
  await page.getByLabel('Amount').fill(amount)
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await save(page)
}

// The row whose detail line starts with this number (a reversal's line also names the entry it cancels).
const row = (list: Locator, number: string) =>
  list.getByRole('listitem').filter({ has: list.page().getByText(new RegExp(`^${number}( ·|$)`)) })

test('corrected, voided and reversal entries carry a label and a red line through the amount', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'cancelled')

  // CAP-0001: corrected 1,000 → 2,000 (reversal CAP-0002, correction CAP-0003).
  await capital(page, '1000')
  await page.getByRole('link', { name: 'Correct' }).click()
  await page.getByLabel('Amount').fill('2000')
  await review(page)
  await save(page, 'Save correction')
  await expect(page.getByTestId('entry-links')).toContainText('Correction of')

  // CAP-0004: voided (reversal CAP-0005).
  await capital(page, '500')
  await page.getByRole('button', { name: 'Void' }).click()
  await page.getByRole('dialog').getByLabel('Reason').fill('Entered by mistake')
  await page.getByRole('dialog').getByRole('button', { name: 'Void entry' }).click()
  await expect(page.locator('[data-slot=badge]', { hasText: 'Voided' })).toBeVisible()

  await page.goto('/entries')
  const list = page.getByTestId('entries-list')
  await expect(list.getByRole('listitem')).toHaveCount(5)
  const label = (n: string) => row(list, n).getByTestId('entry-state')
  await expect(label('CAP-0001')).toHaveText('Corrected')
  await expect(label('CAP-0002')).toHaveText('Reversal')
  await expect(label('CAP-0003')).toHaveCount(0)
  await expect(label('CAP-0004')).toHaveText('Voided')
  await expect(label('CAP-0005')).toHaveText('Reversal')

  // Still greyed out and crossed out; the label itself is not crossed out; the amount's line is red.
  const style = (l: Locator) =>
    l.evaluate((el) => {
      const s = getComputedStyle(el)
      return { line: s.textDecorationLine, color: s.textDecorationColor, thick: s.textDecorationThickness }
    })
  const corrected = row(list, 'CAP-0001')
  expect((await style(corrected.getByText('Capital introduced', { exact: true }))).line).toBe('line-through')
  expect((await style(label('CAP-0001'))).line).toBe('none')
  const amount = await style(corrected.getByText('Rs 1,000'))
  expect(amount.line).toBe('line-through')
  expect(amount.color).toMatch(/^(rgb\(220, 38, 38\)|oklch\(0\.577)/)
  // Greyed out: the row's text is lighter than a live row's.
  const color = (l: Locator) => l.getByRole('link').evaluate((el) => getComputedStyle(el).color)
  expect(await color(corrected)).not.toBe(await color(row(list, 'CAP-0003')))
  // A live entry: no label, nothing crossed out.
  expect((await style(row(list, 'CAP-0003').getByText('Rs 2,000'))).line).toBe('none')
})
