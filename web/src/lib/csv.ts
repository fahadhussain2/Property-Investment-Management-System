export type Cell = string | number | null | undefined

const NUMERIC = /^-?\d+(\.\d+)?$/

/**
 * Builds CSV (RFC 4180). Amounts should be passed as decimal strings ("12500000.00") so Excel
 * reads exact numbers. Text that starts with = + - @ is prefixed with ' so a party or memo named
 * like a formula cannot run as one when the file is opened in a spreadsheet (CSV injection).
 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return ''
    let s = String(v)
    if (!NUMERIC.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

/** Saves CSV as a file. The BOM makes Excel read it as UTF-8. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
