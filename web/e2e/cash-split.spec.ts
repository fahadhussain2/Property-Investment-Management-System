import { expect, test } from '@playwright/test'
import { addBank, expectNoHorizontalScroll, newBusiness, openingBalances } from './helpers'

// Spec 005 amendment 3: the Cash & bank tile shows its cash / bank split in lakh and crore, on the line that held
// the account count, so the tile keeps its height. And the party statement prints on its own.

test('the Cash & bank tile splits cash and bank in short figures, on one line', async ({ page }) => {
  await newBusiness(page, 'cashsplit')
  await addBank(page, 'Meezan')
  await openingBalances(page, { 'Cash in Hand': '550,000', Meezan: '11,325,000' })

  await page.goto('/')
  await expect(page.getByTestId('total-cash')).toHaveText('Rs 11,875,000')
  const split = page.getByTestId('cash-split')
  await expect(split).toHaveText('Cash 5.5 lakh · Bank 1.13 crore')

  // One line, as the account count was, so the tile does not grow. (At 1024 px the four tiles are at their
  // narrowest and the split takes two lines, but so do the other tiles there: the row keeps its height.)
  for (const width of [768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 800 })
    const line = await split.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
    expect((await split.boundingBox())!.height, `one line at ${width} px`).toBeLessThan(line * 1.5)
  }

  await page.setViewportSize({ width: 375, height: 800 })
  await expect(split).toBeVisible()
  await expectNoHorizontalScroll(page, 'dashboard with the cash / bank split')
})

test('a party statement has a Print button and prints only the statement', async ({ page }) => {
  await newBusiness(page, 'partyprint')
  await page.goto('/parties')
  await page.getByRole('button', { name: 'Add party' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Seller P')
  await page.getByRole('dialog').getByLabel('Seller', { exact: true }).check()
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByRole('heading', { name: 'Seller P', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible()

  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('heading', { name: 'Statement · Seller P' })).toBeVisible()
  await expect(page.getByTestId('party-net')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Seller P', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Details' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Entries' })).toBeHidden()
})
