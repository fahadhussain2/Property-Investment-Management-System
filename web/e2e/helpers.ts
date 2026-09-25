import { expect, type Page } from '@playwright/test'

// Each test uses fresh users, so tests are independent and can re-run against the same local DB.
export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
export const PASSWORD = 'correct-horse-9'

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
