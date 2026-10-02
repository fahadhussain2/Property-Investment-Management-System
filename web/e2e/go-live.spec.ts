import { expect, type Page, test } from '@playwright/test'
import { choose, expectNoHorizontalScroll, newBusiness, PASSWORD, SIGN_UP_TIMEOUT, signUp, unique } from './helpers'

// Local Supabase catches every email in Mailpit (http://127.0.0.1:54324).
const MAILPIT = 'http://127.0.0.1:54324'

async function latestEmailText(page: Page, to: string): Promise<string> {
  let text = ''
  await expect(async () => {
    const res = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string }[] }
    expect(messages.length).toBeGreaterThan(0)
    const msg = await (await page.request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()
    text = `${msg.Text ?? ''}\n${msg.HTML ?? ''}`
  }).toPass({ timeout: 15_000 })
  return text
}

test('forgot password: the emailed link lets the user choose a new password and sign in with it', async ({ page }) => {
  const email = `reset-${unique()}@e2e.local`
  await signUp(page, email, `Reset Estates ${unique()}`)
  await expect(page.getByTestId('total-cash')).toBeVisible({ timeout: SIGN_UP_TIMEOUT })
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())

  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 800 })
  await expectNoHorizontalScroll(page, '/forgot-password')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  const body = await latestEmailText(page, email)
  const link = body.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify[^\s"'<>]+/)?.[0]
  expect(link, 'reset link in the email').toBeTruthy()
  await page.goto(link!.replace(/&amp;/g, '&'))

  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('new-horse-battery-7')
  await page.getByLabel('Repeat new password').fill('something-else-7')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByText('The passwords do not match')).toBeVisible()
  await page.getByLabel('Repeat new password').fill('new-horse-battery-7')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByTestId('total-cash')).toBeVisible()

  // The old password no longer works; the new one does.
  await page.context().clearCookies()
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Wrong email or password.')).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('new-horse-battery-7')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('total-cash')).toBeVisible()
})

test('an expired or reused reset link says so and offers a new one', async ({ page }) => {
  await page.goto('/reset-password')
  await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible()
  await page.getByRole('link', { name: 'Send a new link' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
})

test('cut-over: opening deposits and token money, and a long-running lease counted from the cut-over', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'cutover')
  for (const code of ['SHOP-4', 'PLOT-9']) {
    await page.goto('/properties')
    await page.getByRole('button', { name: 'Add property' }).click()
    await page.getByRole('dialog').getByLabel('Code').fill(code)
    await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
    await expect(page.getByRole('heading', { name: code })).toBeVisible()
  }

  await page.goto('/new/opening')
  await page.setViewportSize({ width: 375, height: 800 })
  await expect(page.getByRole('heading', { name: 'Token money received' })).toBeVisible()
  await expectNoHorizontalScroll(page, 'opening balances')
  await page.setViewportSize({ width: 1280, height: 800 })
  const section = (title: string) => page.locator('section', { has: page.getByRole('heading', { name: title }) })
  await page.getByLabel('Cash in Hand', { exact: true }).fill('1,000,000')

  const deposits = section('Security deposits you hold')
  await deposits.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Old Tenant')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await deposits.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await deposits.getByLabel('Deposit held').fill('100,000')

  const advances = section('Token money received')
  await advances.getByRole('button', { name: 'New buyer' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Buyer B')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await advances.getByLabel('Property', { exact: true }).selectOption({ label: 'PLOT-9' })
  await advances.getByLabel('Token money').fill('500,000')

  await page.getByRole('button', { name: 'Review' }).click()
  const preview = page.getByTestId('entry-preview')
  await expect(preview).toContainText('Security Deposits Held')
  await expect(preview).toContainText('Advances from Buyers')
  await page.getByRole('button', { name: 'Save opening balances' }).click()
  await expect(page.getByTestId('we-owe')).toHaveText('Rs 600,000')

  // Token money at cut-over puts the plot under agreement.
  await page.goto('/properties?status=under_agreement')
  await expect(page.getByText('PLOT-9', { exact: true }).filter({ visible: true })).toHaveCount(1)
  await expect(page.getByText('SHOP-4', { exact: true }).filter({ visible: true })).toHaveCount(0)

  // A lease running since 2020, counted from this month (the cut-over): one month due, not six years.
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA')
  await page.goto('/leases')
  await page.getByRole('button', { name: 'New lease' }).click()
  const dialog = page.getByRole('dialog', { name: 'New lease' })
  await dialog.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await choose(dialog.getByLabel('Tenant', { exact: true }), 'Old Tenant')
  await dialog.getByLabel('Start date').fill('2020-01-01')
  await dialog.getByLabel('Rent per month').fill('50,000')
  await dialog.getByLabel('Rent due on day (optional)').fill('1')
  await dialog.getByLabel('Count rent from (optional)').fill(firstOfMonth)
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'SHOP-4 · Old Tenant' })).toBeVisible()
  await expect(page.getByTestId('kpi-unpaid')).toHaveText('Rs 50,000 · 1 mo')
  await expect(page.getByTestId('kpi-deposit')).toHaveText('Rs 100,000')
})
