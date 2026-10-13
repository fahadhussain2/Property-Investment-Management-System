import { expect, test } from '@playwright/test'

// Product owner, 2026-10-13: password fields have an eye button that shows or hides what is typed.

test('login: the eye button shows and hides the password', async ({ page }) => {
  await page.goto('/login')
  const password = page.getByLabel('Password')
  await password.fill('secret-horse-1')
  await expect(password).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('secret-horse-1')

  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('secret-horse-1')
})

test('sign-up has the toggle too, and it does not submit the form', async ({ page }) => {
  await page.goto('/signup')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page).toHaveURL(/\/signup/)
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'text')
})
