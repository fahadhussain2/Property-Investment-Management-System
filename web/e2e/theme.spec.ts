import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, newBusiness } from './helpers'

const isDark = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'))

test('theme toggle switches to dark, survives a reload, and switches back', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await newBusiness(page, 'theme')
  const toggle = page.getByRole('button', { name: 'Dark theme' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(await isDark(page)).toBe(false)

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(await isDark(page)).toBe(true)

  await page.reload()
  await expect(page.getByTestId('total-cash')).toBeVisible()
  expect(await isDark(page)).toBe(true)
  await page.setViewportSize({ width: 375, height: 800 })
  await expectNoHorizontalScroll(page, 'dashboard (dark)')
  await page.setViewportSize({ width: 1280, height: 800 })

  await page.getByRole('button', { name: 'Dark theme' }).click()
  expect(await isDark(page)).toBe(false)
})

test('with no saved choice, the theme follows the device setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/login')
  expect(await isDark(page)).toBe(true)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => isDark(page)).toBe(false)
})
