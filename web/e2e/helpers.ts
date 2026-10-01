import { expect, type Locator, type Page } from '@playwright/test'

// Each test uses fresh users, so tests are independent and can re-run against the same local DB.
export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
export const PASSWORD = 'correct-horse-9'

// Dates on the org's calendar (default timezone Asia/Karachi, see org_today()), never the runner's
// local/UTC clock: near midnight UTC the two disagree on the day, and on the last day of a month on the month.
/** The org's date `n` days from today, as YYYY-MM-DD. */
export const orgDate = (n = 0) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })
/** The 1st of the month `n` months before the month of `ymd` (YYYY-MM-DD), by plain calendar arithmetic. */
export function firstOfMonthsBack(ymd: string, n: number) {
  const [y, m] = ymd.split('-').map(Number)
  const i = y * 12 + (m - 1) - n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`
}

export async function signUp(page: Page, email: string, businessName?: string) {
  await page.goto('/signup')
  if (businessName) await page.getByLabel('Business name').fill(businessName)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
}

/** Signs up a new owner with a fresh business and waits for the dashboard. */
export async function newBusiness(page: Page, prefix = 'e2e') {
  const business = `${prefix} Estates ${unique()}`
  await signUp(page, `${prefix}-${unique()}@e2e.local`, business)
  await expect(page.getByRole('heading', { name: business })).toBeVisible()
  return business
}

export async function expectNoHorizontalScroll(page: Page, label: string) {
  // Compare with clientWidth, not innerWidth: under mobile emulation the browser widens its layout
  // viewport to fit oversized content, so innerWidth grows with the bug and the check never fails.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0)
}

/** Picks the option whose text contains `text` (money-account options include a live balance). */
export async function choose(select: Locator, text: string) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value')
  await select.selectOption(value!)
}

export async function addBank(page: Page, name: string) {
  await page.goto('/settings/accounts/money')
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByTestId('money-accounts')).toContainText(name)
}

export async function openingBalances(page: Page, amounts: Record<string, string>) {
  await page.goto('/new')
  await page.getByRole('link', { name: /Opening balances/ }).click()
  for (const [account, amount] of Object.entries(amounts)) await page.getByLabel(account, { exact: true }).fill(amount)
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByTestId('entry-preview')).toContainText('Opening Balance Equity')
  await page.getByRole('button', { name: 'Save opening balances' }).click()
  await expect(page.getByTestId('total-cash')).toBeVisible()
}

/** Fills and saves an entry form; returns after landing on the saved entry page. */
export async function review(page: Page) {
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByTestId('entry-preview')).toBeVisible()
}
export async function save(page: Page, label = 'Save entry') {
  await page.getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(/\/entries\/[0-9a-f-]{36}$/)
}
