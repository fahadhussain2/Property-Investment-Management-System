import { expect, test } from '@playwright/test'
import { choose, expectNoHorizontalScroll, newBusiness, openingBalances, review, save } from './helpers'

// Spec 003: vehicles, gold and silver, through the UI.

test('gold: buy 10 tola, value it at a rate, sell 3 tola (3/10 of the cost), then sell the rest', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'gold')
  await openingBalances(page, { 'Cash in Hand': '5,000,000' })

  // The item first, from the Gold register (22K is the default purity).
  await page.goto('/gold')
  await expect(page.getByRole('heading', { name: 'Gold', exact: true })).toBeVisible()
  await expect(page.getByTestId('holdings-rate')).toContainText('No gold rate entered yet')
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill('G-01')
  await page.getByRole('dialog').getByLabel('Name (optional)').fill('Bar')
  await page.getByRole('dialog').getByRole('button', { name: 'Add item' }).click()
  await expect(page.getByRole('heading', { name: 'G-01 · Bar' })).toBeVisible()

  // Bought by weight; the form reads the weight back in grams.
  await page.getByRole('link', { name: 'Buy more' }).click()
  await expect(page.getByRole('heading', { name: 'Bought gold or silver' })).toBeVisible()
  await expect(page.getByLabel('Item', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await page.getByLabel('Weight bought').fill('10')
  await expect(page.getByText('= 116.638 g')).toBeVisible()
  await page.getByLabel('Purchase price').fill('2,000,000')
  await page.getByLabel('Paid now').fill('2,000,000')
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await review(page)
  await expect(page.getByTestId('entry-summary')).toHaveText('Bought 10 tola of G-01 for Rs 2,000,000. Paid Rs 2,000,000 now from Cash in Hand.')
  await save(page)

  // Today's rate values it; the books stay at cost.
  await page.goto('/gold')
  await page.getByRole('button', { name: "Set today's rate" }).click()
  await page.getByRole('dialog').getByLabel(/Rate per tola/).fill('250,000')
  await page.getByRole('dialog').getByRole('button', { name: 'Save rate' }).click()
  await expect(page.getByTestId('holdings-weight')).toHaveText('10 tola')
  await expect(page.getByTestId('holdings-cost')).toHaveText('Rs 2,000,000')
  await expect(page.getByTestId('holdings-market')).toHaveText('Rs 2,291,750')
  await expect(page.getByTestId('holdings-gain')).toHaveText('Rs 291,750')
  await page.getByRole('button', { name: 'grams' }).click()
  await expect(page.getByTestId('holdings-weight')).toHaveText('116.638 g')
  await expect(page).toHaveURL(/unit=g/)

  // Dashboard "What we own": gold at cost with its worth; empty classes keep a "None held" tile.
  await page.goto('/')
  await expect(page.getByTestId('asset-gold')).toContainText('Rs 2,000,000')
  await expect(page.getByTestId('asset-gold')).toContainText('10 tola · worth Rs 2,291,750')
  await expect(page.getByTestId('invested-total')).toHaveText('Rs 2,000,000')
  await expect(page.getByTestId('held-cost')).toHaveText('None held')
  await expect(page.getByTestId('asset-silver')).toContainText('None held')
  await expect(page.getByTestId('asset-silver').getByRole('link', { name: 'Silver' })).toHaveAttribute('href', '/silver')
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByTestId('recent-entries')).toBeVisible()
  await expectNoHorizontalScroll(page, 'dashboard with gold')
  await page.setViewportSize({ width: 1280, height: 720 })

  // Sell 3 tola: its share of the cost (600,000) and the gain are shown before saving.
  await page.goto('/gold')
  await page.getByRole('link', { name: 'G-01' }).first().click()
  await page.getByRole('link', { name: 'Sell' }).click()
  await expect(page.getByRole('heading', { name: 'Sold gold or silver' })).toBeVisible()
  await page.getByLabel('Weight sold').fill('3')
  await page.getByLabel('Sale price').fill('720,000')
  await page.getByLabel('Received now').fill('720,000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await expect(page.getByTestId('sale-profit')).toContainText('Profit on this sale: Rs 120,000')
  await expect(page.getByTestId('sale-profit')).toContainText('Cost of what was sold: Rs 600,000')
  await save(page)

  await page.getByRole('link', { name: /G-01/ }).click()
  await expect(page.getByTestId('kpi-weight')).toHaveText('7 tola')
  await expect(page.getByTestId('kpi-cost')).toHaveText('Rs 1,400,000')
  await expect(page.getByTestId('kpi-gain')).toHaveText('Rs 120,000')
  await expect(page.getByText('Partly sold')).toBeVisible()

  // The rest, as "the whole item": all remaining cost is relieved, nothing is left over.
  await page.getByRole('link', { name: 'Sell' }).click()
  await page.getByLabel(/Sell the whole item/).check()
  await expect(page.getByLabel('Weight sold')).toBeHidden()
  await page.getByLabel('Sale price').fill('1,500,000')
  await page.getByLabel('Received now').fill('1,500,000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await expect(page.getByTestId('entry-summary')).toHaveText('Sold all of G-01 for Rs 1,500,000. Received Rs 1,500,000 now into Cash in Hand.')
  await expect(page.getByTestId('sale-profit')).toContainText('Cost of what was sold: Rs 1,400,000')
  await save(page)

  await page.goto('/reports/income-statement')
  await expect(page.getByTestId('is-asset-gains')).toContainText('Rs 220,000')
  await expect(page.getByText('of which Gold')).toBeVisible()

  await page.goto('/gold')
  await expect(page.getByTestId('holdings-weight')).toHaveText('0 tola')
  await expect(page.getByTestId('holdings-cost')).toHaveText('Rs 0')
})

test('vehicle: bought (created on the spot), fuel tagged to it, sold at a gain', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'car')
  await openingBalances(page, { 'Cash in Hand': '5,000,000' })

  await page.goto('/new')
  await page.getByRole('link', { name: /^Bought a vehicle/ }).click()
  await page.getByRole('button', { name: 'New vehicle' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Add a vehicle' })).toBeVisible()
  await page.getByRole('dialog').getByLabel('Code').fill('CAR-1')
  await page.getByRole('dialog').getByLabel('Make (optional)').fill('Toyota')
  await page.getByRole('dialog').getByLabel('Model (optional)').fill('Corolla')
  await page.getByRole('dialog').getByLabel('Engine cc (optional)').fill('1,300')
  await page.getByRole('dialog').getByRole('button', { name: 'Add vehicle' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByLabel('Vehicle', { exact: true })).toHaveValue(/[0-9a-f-]{36}/)
  await expect(page.getByLabel('Weight bought')).toHaveCount(0) // vehicles have no weight
  await page.getByLabel('Purchase price').fill('3,000,000')
  await page.getByLabel('Paid now').fill('3,000,000')
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await review(page)
  await save(page)

  // A running expense, tagged to the vehicle.
  await page.goto('/new/expense')
  await choose(page.getByLabel('Expense head'), 'Fuel')
  await page.getByLabel('Amount').fill('20,000')
  await choose(page.getByLabel('Paid from'), 'Cash in Hand')
  await choose(page.getByLabel('For vehicle (optional)'), 'CAR-1')
  await review(page)
  await expect(page.getByTestId('entry-summary')).toHaveText('Paid Rs 20,000 for Fuel from Cash in Hand (CAR-1).')
  await save(page)

  // Dashboard: the vehicle at cost (running costs are expenses, not cost).
  await page.goto('/')
  await expect(page.getByTestId('asset-vehicle')).toContainText('Rs 3,000,000')
  await expect(page.getByTestId('asset-vehicle')).toContainText('1 vehicle at cost')

  await page.goto('/vehicles')
  await page.getByRole('link', { name: 'CAR-1' }).first().click()
  await expect(page.getByText('1,300 cc')).toBeVisible() // engine capacity, in the details
  await expect(page.getByTestId('kpi-cost')).toHaveText('Rs 3,000,000')
  await expect(page.getByTestId('kpi-running')).toHaveText('Rs 20,000')
  await page.getByRole('link', { name: 'Sell' }).click()
  await expect(page.getByRole('heading', { name: 'Sold a vehicle' })).toBeVisible()
  await page.getByLabel('Sale price').fill('3,200,000')
  await page.getByLabel('Received now').fill('3,200,000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await expect(page.getByTestId('sale-profit')).toContainText('Profit on this sale: Rs 200,000')
  await save(page)

  await page.getByRole('link', { name: /CAR-1/ }).click()
  await expect(page.getByText('Sold', { exact: true })).toBeVisible()
  await expect(page.getByTestId('kpi-gain')).toHaveText('Rs 200,000')
  await expect(page.getByTestId('breakdown-running')).toContainText('Rs 20,000')
  await expect(page.getByRole('link', { name: 'Sell' })).toHaveCount(0)

  await page.goto('/reports/income-statement')
  await expect(page.getByText('of which Vehicles')).toBeVisible()
  await expect(page.getByTestId('income-statement')).toContainText('Vehicle expenses')
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test('vehicles, gold, silver and their forms do not scroll sideways', async ({ page }) => {
    test.slow() // sign-up plus eight pages: over the default 30 s when the whole suite runs in parallel
    await newBusiness(page, 'hmob')
    await page.goto('/gold')
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.getByRole('dialog').getByLabel('Code').fill('G-01')
    await page.getByRole('dialog').getByRole('button', { name: 'Add item' }).click()
    await expect(page.getByRole('heading', { name: 'G-01' })).toBeVisible()
    await expectNoHorizontalScroll(page, 'gold item page')
    for (const [path, heading] of [
      ['/gold', 'Gold'],
      ['/vehicles', 'Vehicles'],
      ['/silver', 'Silver'],
      ['/new/holding_purchase?class=metal', 'Bought gold or silver'],
      ['/new/holding_sale?class=vehicle', 'Sold a vehicle'],
      ['/new/opening', 'Opening balances'],
      ['/reports/holdings', 'Vehicles, gold & silver'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await expectNoHorizontalScroll(page, path)
    }
    // With the item chosen, the weight inputs appear and still fit.
    await page.goto('/new/holding_purchase?class=metal')
    await page.getByLabel('Item', { exact: true }).selectOption({ label: 'G-01' })
    await expect(page.getByLabel('Weight bought')).toBeVisible()
    await expectNoHorizontalScroll(page, 'gold purchase form with weight')
  })
})
