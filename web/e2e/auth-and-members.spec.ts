import { expect, test } from '@playwright/test'
import { expectNoHorizontalScroll, PASSWORD, SIGN_UP_TIMEOUT, signUp, unique } from './helpers'

test('owner signs up with a business and lands on the dashboard', async ({ page }) => {
  const business = `Hussain Estates ${unique()}`
  await signUp(page, `owner-${unique()}@e2e.local`, business)

  await expect(page.getByRole('heading', { name: business })).toBeVisible({ timeout: SIGN_UP_TIMEOUT })
  await expect(page.getByTestId('total-cash')).toHaveText('Rs 0')
  await expect(page.getByTestId('balance-1000')).toContainText('Cash in Hand')
})

// Regression (M2 review): a failed balance load once rendered "Rs 0" as if it were a real balance.
test('dashboard shows an error, never a fake zero, when balances fail to load', async ({ page }) => {
  await page.route('**/rest/v1/rpc/account_balances', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"database unavailable"}' }),
  )
  await signUp(page, `err-${unique()}@e2e.local`, `Error Estates ${unique()}`)

  // Dashboard v2: every block that uses balances shows its own error (Cash tile, Cash by account, Who owes whom).
  await expect(page.getByRole('alert').first()).toContainText('Could not load this', { timeout: 15_000 })
  await expect(page.getByTestId('total-cash')).toHaveCount(0)
  await expect(page.getByTestId('owed-to-us')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Try again' }).first()).toBeVisible()
  // Blocks that do not depend on balances still load.
  await expect(page.getByTestId('profit-fy')).toBeVisible()
  // Retrying inside a tile retries in place; it must not follow the tile's link (review of D2).
  const url = page.url()
  await page.getByRole('button', { name: 'Try again' }).first().click()
  await expect(page.getByRole('alert').first()).toContainText('Could not load this', { timeout: 15_000 })
  expect(page.url()).toBe(url)
})

test('user without a business goes through onboarding', async ({ page }) => {
  await signUp(page, `solo-${unique()}@e2e.local`)
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: SIGN_UP_TIMEOUT })

  const business = `Solo Properties ${unique()}`
  await page.getByLabel('Business name').fill(business)
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page.getByRole('heading', { name: business })).toBeVisible()
})

test('owner invites an accountant who joins through the link', async ({ browser }) => {
  const business = `Team Estates ${unique()}`
  const ownerEmail = `owner-${unique()}@e2e.local`
  const staffEmail = `staff-${unique()}@e2e.local`

  const owner = await (await browser.newContext()).newPage()
  await signUp(owner, ownerEmail, business)
  await expect(owner.getByRole('heading', { name: business })).toBeVisible({ timeout: SIGN_UP_TIMEOUT })

  await owner.goto('/settings/members')
  await owner.getByRole('button', { name: 'Invite' }).click()
  await owner.getByLabel('Email').fill(staffEmail)
  await owner.getByLabel('Role', { exact: true }).selectOption('accountant')
  await owner.getByRole('button', { name: 'Create invitation' }).click()
  const link = (await owner.getByTestId('invite-link').textContent())!.trim()
  expect(link).toContain(encodeURIComponent(staffEmail))

  // The staff member opens the link in their own browser.
  const staff = await (await browser.newContext()).newPage()
  await staff.goto(link)
  await expect(staff.getByRole('heading', { name: 'Join your team' })).toBeVisible()
  await expect(staff.getByLabel('Email')).toHaveValue(staffEmail)
  await staff.getByLabel('Password').fill(PASSWORD)
  await staff.getByRole('button', { name: 'Create account' }).click()
  await expect(staff.getByRole('heading', { name: business })).toBeVisible({ timeout: SIGN_UP_TIMEOUT })

  await staff.goto('/settings/members')
  const members = staff.getByTestId('members-list')
  await expect(members).toContainText(ownerEmail)
  await expect(members).toContainText(staffEmail)
  await expect(members.getByText('accountant')).toBeVisible()
  // Accountants cannot manage members.
  await expect(staff.getByRole('button', { name: 'Invite' })).toHaveCount(0)
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  test('shows bottom tabs and never scrolls sideways', async ({ page }) => {
    await signUp(page, `mobile-${unique()}@e2e.local`, `Mobile Estates ${unique()}`)
    await expect(page.getByTestId('bottom-nav')).toBeVisible({ timeout: SIGN_UP_TIMEOUT })
    await expect(page.getByTestId('bottom-nav').getByRole('link', { name: 'New' })).toBeVisible()

    for (const path of ['/', '/settings/members', '/more']) {
      await page.goto(path)
      await expect(page.getByTestId('bottom-nav')).toBeVisible({ timeout: SIGN_UP_TIMEOUT })
      await expectNoHorizontalScroll(page, path)
    }
  })
})
