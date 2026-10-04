import { expect, type Page, test } from '@playwright/test'
import { expectNoHorizontalScroll, newBusiness, orgDate, PASSWORD, SIGN_UP_TIMEOUT, unique } from './helpers'

// Spec 006: several tenants in one property. Dates are relative to the organization's today, so the leases are
// current whenever the suite runs (occupancy is "as at today").
const start = () => orgDate(0)
const end = () => orgDate(270)

async function addProperty(page: Page, code: string) {
  await page.goto('/properties')
  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill(code)
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('heading', { name: code })).toBeVisible()
  return page.url()
}

async function addUnit(page: Page, name: string) {
  await page.getByTestId('units-section').getByRole('button', { name: 'Add unit' }).click()
  const dialog = page.getByRole('dialog').last()
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Add unit' }).click()
  await expect(page.getByTestId(`unit-${name}`)).toBeVisible()
}

/** Opens "Add lease" on the property page; returns the dialog. */
async function openLease(page: Page) {
  await page.getByRole('button', { name: 'Add lease' }).click()
  const dialog = page.getByRole('dialog', { name: 'New lease' })
  await expect(dialog.getByLabel('Property', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  return dialog
}

async function newTenant(page: Page, dialog: ReturnType<Page['getByRole']>, name: string) {
  await dialog.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').last().getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('dialog').last().getByRole('button', { name: 'Add party' }).click()
  await expect(dialog.getByLabel('Tenant', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
}

async function fillTerms(dialog: ReturnType<Page['getByRole']>, rent: string) {
  await dialog.getByLabel('Start date').fill(start())
  await dialog.getByLabel('End date (optional)').fill(end())
  await dialog.getByLabel('Rent per month').fill(rent)
}

test('two floors of one house let to two tenants for the same dates (the reported case)', async ({ page }) => {
  test.slow() // a long multi-screen flow
  await newBusiness(page, 'units')
  const propertyUrl = await addProperty(page, 'H-10')
  await expect(page.getByTestId('units-section')).toContainText('No units')

  await addUnit(page, 'Ground floor')
  await addUnit(page, '1st floor')
  await expect(page.getByTestId('occupancy')).toHaveText('0 of 2 units rented')

  // A property with units needs an explicit choice: no silent "whole property".
  let dialog = await openLease(page)
  await newTenant(page, dialog, 'Tenant A')
  await fillTerms(dialog, '150,000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(dialog.getByText('Choose a unit, or Whole property')).toBeVisible()
  await dialog.getByLabel('Unit', { exact: true }).selectOption({ label: 'Ground floor (vacant)' })
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'H-10 · Ground floor · Tenant A' })).toBeVisible()

  // The second floor, same dates, another tenant: allowed.
  await page.goto(propertyUrl)
  dialog = await openLease(page)
  await dialog.getByLabel('Unit', { exact: true }).selectOption({ label: '1st floor (vacant)' })
  await newTenant(page, dialog, 'Tenant B')
  await fillTerms(dialog, '120,000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'H-10 · 1st floor · Tenant B' })).toBeVisible()

  await page.goto(propertyUrl)
  await expect(page.getByText('Rented', { exact: true })).toBeVisible()
  await expect(page.getByTestId('occupancy')).toHaveText('2 of 2 units rented')
  await expect(page.getByTestId('unit-Ground floor')).toContainText(`Rented to Tenant A until ${end().split('-').reverse().join('/')}`)
  await expect(page.getByTestId('rent-roll')).toContainText('H-10 · 1st floor · Tenant B')

  // The same unit twice, and the whole property over a let unit, are refused in plain words.
  dialog = await openLease(page)
  await dialog.getByLabel('Unit', { exact: true }).selectOption({ label: 'Ground floor (rented)' })
  await dialog.getByLabel('Tenant', { exact: true }).selectOption({ label: 'Tenant B' })
  await fillTerms(dialog, '100000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(dialog.getByRole('alert')).toContainText('This unit already has a lease for these dates')
  await dialog.getByLabel('Unit', { exact: true }).selectOption({ label: 'Whole property' })
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(dialog.getByRole('alert')).toContainText('A unit of this property is rented for these dates')
  await page.keyboard.press('Escape')

  // Occupancy on the register; the unit wherever the lease is named.
  await page.goto('/properties')
  await expect(page.getByTestId('property-table').getByTestId('occupancy')).toHaveText('2 of 2 units rented')
  await page.goto('/leases')
  await expect(page.getByTestId('rent-roll')).toContainText('H-10 · Ground floor · Tenant A')
  await page.goto('/new/rent')
  await expect(page.getByLabel('Lease', { exact: true }).locator('option', { hasText: 'H-10 · 1st floor · Tenant B' })).toHaveCount(1)

  // Phones: no sideways scroll on the property page, the unit dialog, the lease form and the rent roll.
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(propertyUrl)
  await expect(page.getByTestId('unit-list')).toBeVisible()
  await expectNoHorizontalScroll(page, 'property page with units')
  await page.getByTestId('units-section').getByRole('button', { name: 'Add unit' }).click()
  await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).toBeVisible()
  await expectNoHorizontalScroll(page, 'unit dialog')
  await page.keyboard.press('Escape')
  dialog = await openLease(page)
  await expect(dialog.getByLabel('Unit', { exact: true })).toBeVisible()
  await expectNoHorizontalScroll(page, 'lease form with units')
  await page.keyboard.press('Escape')
  await page.goto('/leases')
  await expect(page.getByTestId('rent-roll')).toBeVisible()
  await expectNoHorizontalScroll(page, '/leases with units')
})

test('a first unit added from inside the lease form; a let unit is renamed, not deleted', async ({ page }) => {
  await newBusiness(page, 'unitform')
  const propertyUrl = await addProperty(page, 'PLAZA')

  const dialog = await openLease(page)
  await expect(dialog.getByText('Whole property: it has no units.')).toBeVisible()
  await dialog.getByRole('button', { name: 'New unit' }).click()
  await page.getByRole('dialog').last().getByLabel('Name', { exact: true }).fill('Shop 1')
  await page.getByRole('dialog').last().getByRole('button', { name: 'Add unit' }).click()
  await expect(dialog.getByLabel('Unit', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await newTenant(page, dialog, 'Tenant C')
  await fillTerms(dialog, '50000')
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'PLAZA · Shop 1 · Tenant C' })).toBeVisible()

  await page.goto(propertyUrl)
  await expect(page.getByTestId('occupancy')).toHaveText('1 of 1 unit rented')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete Shop 1' }).click()
  await expect(page.getByText('Shop 1 has leases, so it can’t be deleted.')).toBeVisible()
  await expect(page.getByTestId('unit-Shop 1')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Shop 1' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Shop 1A')
  await page.getByRole('dialog').getByRole('button', { name: 'Save unit' }).click()
  await expect(page.getByTestId('unit-Shop 1A')).toBeVisible()
  await expect(page.getByTestId('rent-roll')).toContainText('PLAZA · Shop 1A · Tenant C')
})

test('a viewer sees units but cannot add, rename or delete them', async ({ browser }) => {
  test.slow() // two sign-ups plus an invitation
  const owner = await (await browser.newContext()).newPage()
  await newBusiness(owner, 'unitview')
  const propertyUrl = await addProperty(owner, 'SHOPS')
  await addUnit(owner, 'Shop 1')

  const viewerEmail = `viewer-${unique()}@e2e.local`
  await owner.goto('/settings/members')
  await owner.getByRole('button', { name: 'Invite' }).click()
  await owner.getByLabel('Email').fill(viewerEmail)
  await owner.getByLabel('Role', { exact: true }).selectOption('viewer')
  await owner.getByRole('button', { name: 'Create invitation' }).click()
  const link = (await owner.getByTestId('invite-link').textContent())!.trim()

  const viewer = await (await browser.newContext()).newPage()
  await viewer.goto(link)
  await viewer.getByLabel('Password').fill(PASSWORD)
  await viewer.getByRole('button', { name: 'Create account' }).click()
  await expect(viewer.getByTestId('total-cash')).toBeVisible({ timeout: SIGN_UP_TIMEOUT })
  await viewer.goto(propertyUrl)
  await expect(viewer.getByTestId('unit-Shop 1')).toContainText('Vacant')
  await expect(viewer.getByRole('button', { name: 'Add unit' })).toHaveCount(0)
  await expect(viewer.getByRole('button', { name: 'Edit Shop 1' })).toHaveCount(0)
  await expect(viewer.getByRole('button', { name: 'Delete Shop 1' })).toHaveCount(0)
})

// Regression (U2 gate): a quick save while the units are still loading must wait for them, not be refused, and a
// property with units must still ask for a choice. The units response is held back (after a reload, so nothing is
// cached), and each save is checked to happen while the form still says "Loading units…".
test('saving before the units arrive waits for them instead of refusing', async ({ page }) => {
  test.slow() // two held-back loads of 3 s each, under parallel load
  await newBusiness(page, 'unitrace')
  const propertyUrl = await addProperty(page, 'SLOW-1')
  let slow = false
  await page.route('**/rest/v1/property_units_overview*', async (route) => {
    if (slow) await new Promise((r) => setTimeout(r, 3000))
    await route.continue()
  })
  // The tenant first, so the timed part below is only: choose, type, save.
  let dialog = await openLease(page)
  await newTenant(page, dialog, 'Tenant D')
  await page.keyboard.press('Escape')

  // No units: the save waits for the (empty) units and the lease is for the whole property.
  slow = true
  await page.reload()
  dialog = await openLease(page)
  await dialog.getByLabel('Tenant', { exact: true }).selectOption({ label: 'Tenant D' })
  await dialog.getByLabel('Rent per month').fill('40000')
  await expect(dialog.getByRole('option', { name: 'Loading units…' })).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(page.getByRole('heading', { name: 'SLOW-1 · Tenant D' })).toBeVisible()

  // With units: a save before the Unit field appears asks for the unit rather than leasing the whole property.
  slow = false
  await page.goto(propertyUrl)
  await addUnit(page, 'Shop 2')
  slow = true
  await page.reload()
  dialog = await openLease(page)
  await dialog.getByLabel('Tenant', { exact: true }).selectOption({ label: 'Tenant D' })
  await dialog.getByLabel('Start date').fill(orgDate(400))
  await dialog.getByLabel('Rent per month').fill('40000')
  await expect(dialog.getByRole('option', { name: 'Loading units…' })).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Add lease' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Choose a unit, or Whole property')
})
