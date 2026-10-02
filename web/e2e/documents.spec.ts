import { expect, test, type Page } from '@playwright/test'
import { choose, expectNoHorizontalScroll, newBusiness, PASSWORD, SIGN_UP_TIMEOUT, review, save, unique } from './helpers'

// Spec 004: documents, through the UI and the real Storage API.

const pdf = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
})

async function addProperty(page: Page, code: string) {
  await page.goto('/properties')
  await page.getByRole('button', { name: 'Add property' }).click()
  await page.getByRole('dialog').getByLabel('Code').fill(code)
  await page.getByRole('dialog').getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('heading', { name: code })).toBeVisible()
}

/**
 * Clicks something that opens a document in a new tab and returns the signed link it went to, after checking
 * the link serves the file. (Headless Chromium downloads PDFs instead of showing them, so the tab's own URL
 * stays about:blank; the request is what proves it.)
 */
async function opensSignedLink(page: Page, open: () => Promise<void>) {
  const request = page.context().waitForEvent('request', (r) => r.url().includes('/storage/v1/object/sign/documents/') && r.url().includes('token='))
  await open()
  const url = (await request).url()
  const res = await page.request.get(url)
  expect(res.status(), `${url} -> ${await res.text()}`).toBe(200)
  return url
}

async function upload(page: Page, file: Parameters<Page['setInputFiles']>[1], category?: string, title?: string) {
  const section = page.getByTestId('documents-section')
  await section.getByRole('button', { name: 'Upload' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('File').setInputFiles(file)
  if (category) await dialog.getByLabel('What is it?').selectOption({ label: category })
  if (title) await dialog.getByLabel('Title (optional)').fill(title)
  await dialog.getByRole('button', { name: 'Upload' }).click()
}

test('a property keeps its papers: upload, reject wrong files, open, download, edit, delete (on a phone)', async ({ page }) => {
  test.slow()
  await page.setViewportSize({ width: 375, height: 812 })
  await newBusiness(page, 'docs')
  await addProperty(page, 'DP-25')
  const section = page.getByTestId('documents-section')
  await expect(section).toContainText('No documents yet.')

  // Wrong type and too big: a clear message, nothing saved.
  await upload(page, { name: 'setup.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') })
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(/can’t be kept\. Use PDF, JPG, PNG, WebP or HEIC/)
  await page.getByRole('dialog').getByLabel('File').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024) })
  await page.getByRole('dialog').getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('This file is 11 MB. The limit is 10 MB.')
  await expectNoHorizontalScroll(page, 'upload dialog')
  await page.keyboard.press('Escape')
  await expect(section).toContainText('No documents yet.')

  // A PDF sale agreement. The title is prefilled from the file name.
  await section.getByRole('button', { name: 'Upload' }).click()
  await page.getByRole('dialog').getByLabel('File').setInputFiles(pdf('Sale deed DP-25.pdf'))
  await expect(page.getByRole('dialog').getByLabel('Title (optional)')).toHaveValue('Sale deed DP-25')
  await page.getByRole('dialog').getByLabel('What is it?').selectOption({ label: 'Sale agreement' })
  await page.getByRole('dialog').getByRole('button', { name: 'Upload' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  const row = section.getByTestId('document-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Sale deed DP-25')
  await expectNoHorizontalScroll(page, 'property page with a document and all its actions')
  await expect(row).toContainText('Sale agreement')

  // Opens from a short-lived signed link in a new tab; downloads under its original name.
  const url = await opensSignedLink(page, () => row.getByRole('button', { name: 'Open Sale deed DP-25' }).click())
  expect(url).toMatch(/\/documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/Sale_deed_DP-25\.pdf\?token=/)
  const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Download Sale deed DP-25' }).click()])
  expect(download.suggestedFilename()).toBe('Sale deed DP-25.pdf')

  // Edit details: title and category, the file stays.
  await row.getByRole('button', { name: 'Edit details of Sale deed DP-25' }).click()
  await page.getByRole('dialog').getByLabel('Title').fill('Sale agreement with Ahmed')
  await page.getByRole('dialog').getByLabel('What is it?').selectOption({ label: 'Registry / title deed' })
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(row).toContainText('Sale agreement with Ahmed')
  await expect(row).toContainText('Registry / title deed')

  // The property can't be deleted while it has documents.
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete property' }).click()
  await expect(page.getByText('This record has documents attached. Delete them first')).toBeVisible()

  // The Documents page lists it with a link back; filters and search work and stay in the address.
  await page.getByRole('link', { name: 'Open in Documents' }).click()
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible()
  await expect(page.getByTestId('record-filter')).toContainText('DP-25')
  await page.getByRole('button', { name: 'Show all' }).click()
  await page.getByLabel('Filter by kind of document').selectOption({ label: 'Receipt' })
  await expect(page.getByText('No documents match these filters')).toBeVisible()
  await page.getByLabel('Filter by kind of document').selectOption({ label: 'All kinds' })
  await page.getByLabel('Search documents').fill('ahmed')
  await expect(page).toHaveURL(/q=ahmed/)
  await expect(page.getByTestId('document-row')).toHaveCount(1)
  await expect(page.getByTestId('document-row')).toContainText(/docs-[a-z0-9]+@e2e\.local, /) // uploaded by
  await expectNoHorizontalScroll(page, 'documents page with write actions')
  await page.getByTestId('document-row').getByRole('link', { name: 'DP-25' }).click()
  await expect(page.getByRole('heading', { name: 'DP-25' })).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByTestId('storage-used')).toHaveText(/Storage used: \d+ B of 1 GB/)

  // Delete: the row and the file go.
  await page.goto('/documents')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Delete Sale agreement with Ahmed' }).click()
  await expect(page.getByText('No documents yet')).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByTestId('storage-used')).toHaveText('Storage used: 0 B of 1 GB')
})

test('a big phone photo is made smaller, and a receipt stays with a corrected rent entry', async ({ page }) => {
  test.slow()
  await newBusiness(page, 'rcpt')
  await addProperty(page, 'SHOP-4')

  await page.goto('/new/rent')
  await page.getByLabel('Property', { exact: true }).selectOption({ label: 'SHOP-4' })
  await page.getByRole('button', { name: 'New tenant' }).click()
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Tenant X')
  await page.getByRole('dialog').getByRole('button', { name: 'Add party' }).click()
  await page.getByLabel('Rent received').fill('50000')
  await choose(page.getByLabel('Received into'), 'Cash in Hand')
  await review(page)
  await save(page)
  await expect(page.getByRole('heading', { name: 'Rent received · RNT-0001' })).toBeVisible()

  // A 3,000 × 2,000 photo, generated in the browser as a large PNG (over 2 MB).
  const photo = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 3000
    c.height = 2000
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 3000, 2000)
    g.addColorStop(0, '#345')
    g.addColorStop(1, '#fc9')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 3000, 2000)
    const img = ctx.getImageData(0, 0, 3000, 2000)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() * 24) | 0
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  })
  const buffer = Buffer.from(photo, 'base64')
  expect(buffer.length).toBeGreaterThan(2 * 1024 * 1024)

  await upload(page, { name: 'receipt-photo.png', mimeType: 'image/png', buffer })
  const row = page.getByTestId('documents-section').getByTestId('document-row')
  await expect(row).toContainText('receipt-photo')
  await expect(row).toContainText('Receipt') // the default kind on an entry
  // Stored as a JPEG: it downloads as one.
  const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Download receipt-photo' }).click()])
  expect(download.suggestedFilename()).toBe('receipt-photo.jpg')
  const size = (await row.textContent())!.match(/([\d.]+) (KB|MB)/)!
  expect(size[2] === 'KB' || Number(size[1]) < 2, `stored size ${size[0]}`).toBe(true)

  // Opens inline as an image.
  await row.getByRole('button', { name: 'Open receipt-photo' }).click()
  await expect(page.getByRole('dialog').getByRole('img', { name: 'receipt-photo' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Correct 50,000 → 55,000: the receipt moves to the corrected entry.
  await page.getByRole('link', { name: 'Correct' }).click()
  await page.getByLabel('Rent received').fill('55000')
  await review(page)
  await save(page, 'Save correction')
  await expect(page.getByRole('heading', { name: 'Rent received · RNT-0003' })).toBeVisible()
  await expect(page.getByTestId('documents-section').getByTestId('document-row')).toContainText('receipt-photo')
  await page.setViewportSize({ width: 375, height: 812 })
  await expectNoHorizontalScroll(page, 'entry page with documents at 375 px')
})

test('a viewer can open documents but not add, edit or delete them; pages fit a phone', async ({ browser }) => {
  test.slow()
  const owner = await (await browser.newContext()).newPage()
  await newBusiness(owner, 'dview')
  await addProperty(owner, 'FLAT-7')
  await upload(owner, pdf('Registry FLAT-7.pdf'), 'Registry / title deed')
  await expect(owner.getByTestId('document-row')).toHaveCount(1)

  const viewerEmail = `dviewer-${unique()}@e2e.local`
  await owner.goto('/settings/members')
  await owner.getByRole('button', { name: 'Invite' }).click()
  await owner.getByLabel('Email').fill(viewerEmail)
  await owner.getByLabel('Role', { exact: true }).selectOption('viewer')
  await owner.getByRole('button', { name: 'Create invitation' }).click()
  const link = (await owner.getByTestId('invite-link').textContent())!.trim()

  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const viewer = await context.newPage()
  await viewer.goto(link)
  await viewer.getByLabel('Password').fill(PASSWORD)
  await viewer.getByRole('button', { name: 'Create account' }).click()
  await expect(viewer.getByTestId('total-cash')).toBeVisible({ timeout: SIGN_UP_TIMEOUT })

  await viewer.goto('/documents')
  const row = viewer.getByTestId('document-row')
  await expect(row).toContainText('Registry FLAT-7')
  await expect(row.getByRole('button', { name: /^Download/ })).toBeVisible()
  await expect(row.getByRole('button', { name: /^Edit details/ })).toHaveCount(0)
  await expect(row.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
  await expectNoHorizontalScroll(viewer, 'documents page at 375 px')

  await row.getByRole('link', { name: 'FLAT-7' }).click()
  await expect(viewer.getByRole('heading', { name: 'FLAT-7' })).toBeVisible()
  const section = viewer.getByTestId('documents-section')
  await expect(section.getByTestId('document-row')).toHaveCount(1)
  await expect(section.getByRole('button', { name: 'Upload' })).toHaveCount(0)
  await expectNoHorizontalScroll(viewer, 'property page documents at 375 px')

  await opensSignedLink(viewer, () => section.getByRole('button', { name: 'Open Registry FLAT-7' }).click())
  await context.close()
})
