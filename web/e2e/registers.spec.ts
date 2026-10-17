import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expectNoHorizontalScroll, newBusiness, openingBalances, PASSWORD, SIGN_UP_TIMEOUT, unique } from './helpers'

// Spec 007: registers are ledgers kept outside the books. Add, correct and void lines; the dashboard and the
// reports never move; print, CSV, archive, delete; viewers read only; phones.

/** Every dashboard figure that comes from the books, as text. */
async function dashboard(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('total-cash')).toBeVisible()
  await expect(page.getByTestId('profit-fy')).toBeVisible()
  const t = async (id: string) => (await page.getByTestId(id).textContent())?.trim()
  return { cash: await t('cash-total'), bank: await t('bank-total'), total: await t('total-cash'), profit: await t('profit-fy'), invested: await t('invested-total') }
}

async function addRegister(page: Page, name: string, opening: string) {
  await page.goto('/registers')
  await page.getByRole('button', { name: 'Add register' }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Name', { exact: true }).fill(name)
  await d.getByLabel(/Opening balance/).fill(opening)
  await d.getByRole('button', { name: 'Add register' }).click()
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
}

async function addEntry(page: Page, description: string, direction: 'in' | 'out', amount: string) {
  await page.getByRole('button', { name: 'Add entry' }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Description').fill(description)
  await d.getByLabel(direction === 'in' ? 'Money in' : 'Money out').check()
  await d.getByLabel(/^Amount/).fill(amount)
  await d.getByRole('button', { name: 'Add entry' }).click()
  await expect(d).toBeHidden()
}

const ledgerRows = (page: Page) => page.getByTestId('register-ledger').getByTestId('ledger-row')
const row = (page: Page, text: string) => ledgerRows(page).filter({ hasText: text })

test('a register: lines, corrections and voids, print and CSV, and the books never move', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'registers')
  await page.setViewportSize({ width: 1280, height: 900 })
  await openingBalances(page, { 'Cash in Hand': '100,000' })
  const before = await dashboard(page)
  expect(before.total).toBe('Rs 100,000')

  // Nothing yet: an invitation, not an error.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Registers' }).click()
  await expect(page.getByRole('heading', { name: 'Registers', level: 1 })).toBeVisible()
  await expect(page.getByText('No registers yet')).toBeVisible()

  await addRegister(page, 'Zakat Fund', '53,650')
  await expect(page.getByText('Not part of your books')).toBeVisible()
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 53,650')
  await expect(page.getByTestId('ledger-opening')).toHaveText('Rs 53,650')

  await addEntry(page, 'Zakat received', 'in', '1,000,000')
  await addEntry(page, 'Amjad medical', 'out', '23,500')
  await expect(page.getByTestId('register-in')).toHaveText('Rs 1,000,000')
  await expect(page.getByTestId('register-out')).toHaveText('Rs 23,500')
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 1,030,150')
  await expect(ledgerRows(page)).toHaveCount(2)
  await expect(row(page, 'Zakat received')).toContainText('Rs 1,053,650')
  await expect(row(page, 'Amjad medical')).toContainText('Rs 1,030,150')
  await page.reload()
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 1,030,150')

  // Correct 23,500 -> 25,000: the original stays, crossed out and labelled; the new line counts.
  await row(page, 'Amjad medical').getByRole('button', { name: 'Correct' }).click()
  const d = page.getByRole('dialog')
  await expect(d.getByLabel(/^Amount/)).toHaveValue('23500.00')
  await d.getByLabel(/^Amount/).fill('25,000')
  await d.getByLabel('Reason (optional)').fill('wrong amount')
  await d.getByRole('button', { name: 'Save correction' }).click()
  await expect(ledgerRows(page)).toHaveCount(3)
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 1,028,650')
  const corrected = ledgerRows(page).filter({ has: page.getByTestId('entry-state').filter({ hasText: 'Corrected' }) })
  await expect(corrected).toHaveCount(1)
  await expect(corrected).toContainText('wrong amount')
  await expect(corrected.getByText('Rs 23,500')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(corrected.getByText('Amjad medical')).toHaveCSS('text-decoration-line', 'line-through')
  await expect(corrected.getByTestId('entry-state')).toHaveCSS('text-decoration-line', 'none')
  await expect(corrected.getByRole('button', { name: 'Correct' })).toHaveCount(0)
  await expect(ledgerRows(page).filter({ hasText: 'Correction of' })).toHaveCount(1)

  // Void a line: it stays, labelled, and the balance drops it.
  await addEntry(page, 'Misc person', 'out', '500')
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 1,028,150')
  await row(page, 'Misc person').getByRole('button', { name: 'Void' }).click()
  await page.getByRole('dialog').getByLabel('Reason (optional)').fill('entered twice')
  await page.getByRole('dialog').getByRole('button', { name: 'Void entry' }).click()
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 1,028,650')
  await expect(row(page, 'Misc person').getByTestId('entry-state')).toHaveText('Voided')
  await expect(row(page, 'Misc person')).toContainText('entered twice')
  await expect(ledgerRows(page)).toHaveCount(4)

  // The books did not move.
  expect(await dashboard(page)).toEqual(before)
  await page.goto('/reports/income-statement')
  await expect(page.getByTestId('is-net')).toContainText('Rs 0')

  // Print: only the register, under its header.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Registers' }).click()
  await page.getByTestId('register-card').filter({ hasText: 'Zakat Fund' }).click()
  await expect(page.getByTestId('register-balance')).toHaveText('Rs 1,028,650')
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('heading', { name: 'Zakat Fund', level: 1 })).toBeVisible()
  await expect(page.getByText('Register, not part of the books')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Add entry' })).toBeHidden()
  await expect(ledgerRows(page).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Correct' }).first()).toBeHidden()
  await page.emulateMedia({ media: 'screen' })

  // CSV: every line, voided ones with their status, ISO dates.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
  const csv = readFileSync((await download.path())!, 'utf8')
  expect(csv).toContain('Date,Description,In,Out,Balance,Status,Reason')
  expect(csv).toContain('Opening balance')
  expect(csv).toMatch(/Zakat received,1000000\.00,,1053650\.00,Live/)
  expect(csv).toMatch(/Amjad medical,,23500\.00,.*,Corrected,wrong amount/)
  expect(csv).toMatch(/Misc person,,500\.00,.*,Voided,entered twice/)

  // Archive: no new entries; restore.
  await page.getByRole('button', { name: 'Archive register' }).click()
  await expect(page.getByText('Not part of your books · Archived')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add entry' })).toHaveCount(0)
  await expect(row(page, 'Zakat received').getByRole('button', { name: 'Void' })).toHaveCount(0)
  await page.goto('/registers')
  await expect(page.getByTestId('register-archived').getByText('Zakat Fund')).toBeVisible()
  await page.getByTestId('register-archived').getByText('Zakat Fund').click()
  await page.getByRole('button', { name: 'Restore register' }).click()
  await expect(page.getByRole('button', { name: 'Add entry' })).toBeVisible()

  // Rename; an empty register can be deleted, one with lines cannot (no delete button).
  await page.getByRole('button', { name: 'Edit register' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Zakat Fund 2026')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Zakat Fund 2026', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete register' })).toHaveCount(0)
  await addRegister(page, 'Temporary', '')
  page.once('dialog', (dlg) => dlg.accept())
  await page.getByRole('button', { name: 'Delete register' }).click()
  await expect(page).toHaveURL(/\/registers$/)
  await expect(page.getByTestId('register-card').filter({ hasText: 'Temporary' })).toHaveCount(0)

  // A second register with the same name is refused in plain words.
  await page.getByRole('button', { name: 'Add register' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('zakat fund 2026')
  await page.getByRole('dialog').getByRole('button', { name: 'Add register' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('You already have a register with that name.')
})

test('a viewer sees a register and its ledger but cannot change anything', async ({ browser }) => {
  test.slow() // two sign-ups plus an invitation
  const owner = await (await browser.newContext()).newPage()
  await newBusiness(owner, 'regview')
  await addRegister(owner, 'Family loans', '1,000')
  await addEntry(owner, 'Lent to Ali', 'out', '400')

  const viewerEmail = `viewer-${unique()}@e2e.local`
  await owner.goto('/settings/members')
  await owner.getByRole('button', { name: 'Invite' }).click()
  await owner.getByLabel('Email').fill(viewerEmail)
  await owner.getByLabel('Role', { exact: true }).selectOption('viewer')
  await owner.getByRole('button', { name: 'Create invitation' }).click()
  const link = (await owner.getByTestId('invite-link').textContent())!.trim()

  const viewer = await (await browser.newContext()).newPage()
  await viewer.setViewportSize({ width: 1280, height: 900 })
  await viewer.goto(link)
  await viewer.getByLabel('Password').fill(PASSWORD)
  await viewer.getByRole('button', { name: 'Create account' }).click()
  await expect(viewer.getByTestId('total-cash')).toBeVisible({ timeout: SIGN_UP_TIMEOUT })
  await viewer.goto('/registers')
  await expect(viewer.getByRole('button', { name: 'Add register' })).toHaveCount(0)
  await viewer.getByTestId('register-card').filter({ hasText: 'Family loans' }).click()
  await expect(viewer.getByTestId('register-balance')).toHaveText('Rs 600')
  await expect(ledgerRows(viewer)).toHaveCount(1)
  for (const name of ['Add entry', 'Correct', 'Void', 'Edit register', 'Archive register', 'Delete register']) {
    await expect(viewer.getByRole('button', { name })).toHaveCount(0)
  }
  await expect(viewer.getByRole('button', { name: 'Print' })).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`phones: registers and a register page do not scroll sideways (${theme})`, async ({ page }) => {
    test.slow()
    await newBusiness(page, `regphone${theme}`)
    await addRegister(page, 'Zakat Fund with a rather long name to wrap on a phone', '53,650')
    await addEntry(page, 'Saleem child milk, a long description that has to wrap on a narrow screen', 'out', '12,500,000')
    await page.setViewportSize({ width: 375, height: 800 })
    if (theme === 'dark') await page.getByRole('button', { name: 'Dark theme' }).click()
    await page.goto('/registers')
    await expect(page.getByTestId('register-card')).toBeVisible()
    await expectNoHorizontalScroll(page, `registers (${theme})`)
    await page.getByTestId('register-card').click()
    await expect(page.getByTestId('register-ledger-list')).toBeVisible()
    await expect(page.getByTestId('register-ledger')).toBeHidden()
    await expect(page.getByTestId('register-balance')).toBeVisible()
    await expectNoHorizontalScroll(page, `register page (${theme})`)
    // Reached from the More page on phones.
    await page.goto('/more')
    await expect(page.getByRole('link', { name: 'Registers' })).toBeVisible()
  })
}

test('registers never appear on the dashboard', async ({ page }) => {
  await newBusiness(page, 'regdash')
  await addRegister(page, 'Zakat Fund', '1,000')
  await page.goto('/')
  await expect(page.getByTestId('total-cash')).toBeVisible()
  await expect(page.getByRole('main').getByText(/register/i)).toHaveCount(0)
  await expect(page.getByRole('main').getByText('Zakat Fund')).toHaveCount(0)
})
