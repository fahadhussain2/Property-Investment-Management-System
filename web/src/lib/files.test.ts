import { describe, expect, it } from 'vitest'
import { allowedMimeType, fileProblem, fitWithin, formatBytes, MAX_FILE_BYTES, safeFileName, withExtension } from './files'

describe('files', () => {
  it('accepts the five types, by MIME type or by extension when the type is missing', () => {
    expect(allowedMimeType('a.pdf', 'application/pdf')).toBe('application/pdf')
    expect(allowedMimeType('IMG_1.HEIC', '')).toBe('image/heic')
    expect(allowedMimeType('photo.jpeg', 'application/octet-stream')).toBe('image/jpeg')
    expect(allowedMimeType('setup.exe', 'application/x-msdownload')).toBeNull()
    expect(allowedMimeType('notes.docx', '')).toBeNull()
    // A known-bad type is not rescued by a friendly extension.
    expect(allowedMimeType('evil.pdf', 'application/x-msdownload')).toBeNull()
  })

  it('explains what is wrong with a file', () => {
    expect(fileProblem('', 0, '')).toBe('Choose a file.')
    expect(fileProblem('a.exe', 10, 'application/x-msdownload')).toMatch(/can’t be kept/)
    expect(fileProblem('big.pdf', 12 * 1024 * 1024, 'application/pdf')).toBe('This file is 12 MB. The limit is 10 MB.')
    expect(fileProblem('ok.pdf', MAX_FILE_BYTES, 'application/pdf')).toBeNull()
  })

  it('makes safe storage names that keep the extension', () => {
    expect(safeFileName('Sale deed DP-25.pdf')).toBe('Sale_deed_DP-25.pdf')
    expect(safeFileName('رجسٹری.jpg')).toBe('file.jpg')
    expect(safeFileName('../../etc/passwd')).toBe('etc_passwd')
    const long = safeFileName(`${'a'.repeat(300)}.pdf`)
    expect(long).toHaveLength(100)
    expect(long.endsWith('.pdf')).toBe(true)
  })

  it('fits images within the longest side', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2400, height: 1800 })
    expect(fitWithin(1000, 800)).toEqual({ width: 1000, height: 800 })
  })

  it('formats sizes and swaps extensions', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(250_000)).toBe('244 KB')
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.3 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
    expect(withExtension('IMG_2041.PNG', 'jpg')).toBe('IMG_2041.jpg')
  })
})
