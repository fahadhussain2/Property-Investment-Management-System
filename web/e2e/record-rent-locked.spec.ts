import { expect, test } from '@playwright/test'
import { choose, newBusiness, orgDate, review, save } from './helpers'

// Record rent / Deposit opened from a lease: the lease is fixed (locked); elsewhere it can be chosen as before.
test('rent and deposit opened from a lease keep that lease; a plain rent entry can still choose one', async ({ page }) => {
  test.slow() // a property, a tenant, a lease and two entries through the UI
  await newBusiness(page, 'leaselock')
  await page.goto('/properties')
  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('LOCK-1')
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('heading', { name: 'LOCK-1' })).toBeVisible()

  await page.getByRole('button', { name: 'Add lease' }).click()
  const dialog = page.getByRole('dialog', { name: 'New lease' })
  await dialog.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').last().getByLabel('Name', { exact: true }).fill('Tenant L')
  await page.getByRole('dialog').last().getByRole('button', { name: 'Add party' }).click()
  await expect(dialog.getByLabel('Tenant', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await dialog.getByLabel('Start date').fill(orgDate(0))
  await dialog.getByLabel('Rent per month').fill('40000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'LOCK-1 · Tenant L' })).toBeVisible()
  const leaseUrl = page.url()
  const leaseId = leaseUrl.split('/').pop()!

  // Record rent: the lease is shown, chosen and cannot be changed; the entry is saved against it.
  await page.getByRole('link', { name: 'Record rent' }).click()
  const lease = page.getByLabel('Lease', { exact: true })
  await expect(lease).toHaveValue(leaseId)
  await expect(lease).toBeDisabled()
  await expect(page.getByText('Opened from this lease')).toBeVisible()
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await expect(page.getByTestId('entry-summary')).toContainText('Tenant L')
  await save(page)
  await page.goto(leaseUrl)
  await expect(page.getByTestId('kpi-received')).toContainText('Rs 40,000')

  // Deposit from the lease: locked the same way.
  await page.getByRole('link', { name: 'Deposit' }).click()
  await expect(page.getByLabel('Lease', { exact: true })).toHaveValue(leaseId)
  await expect(page.getByLabel('Lease', { exact: true })).toBeDisabled()

  // New entry → Rent (no lease in the link): the lease is a normal choice.
  await page.goto('/new/rent')
  await expect(page.getByLabel('Lease', { exact: true })).toBeEnabled()
  await page.getByLabel('Lease', { exact: true }).selectOption(leaseId)
  await expect(page.getByLabel('Lease', { exact: true })).toHaveValue(leaseId)
})
