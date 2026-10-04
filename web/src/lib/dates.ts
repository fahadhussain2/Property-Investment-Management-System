// How dates are shown everywhere in the app: dd/mm/yyyy, whatever the browser's language (product owner,
// 2026-10-04). Dates still travel and are stored as ISO "yyyy-mm-dd", and CSV keeps ISO (Excel reads it
// the same way on every computer). Date inputs are the browser's own and follow its language setting.

const pad = (n: number) => String(n).padStart(2, '0')
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * "2026-10-04" → "04/10/2026". A business date is read as text, never through `Date`, so it cannot shift a day
 * with the time zone. A timestamp ("2026-10-04T18:30:00Z", or a Date) shows its local calendar date.
 */
export function formatDate(value: string | Date): string {
  if (typeof value === 'string') {
    const m = ISO_DATE.exec(value)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
  const d = typeof value === 'string' ? new Date(value) : value
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** A moment in local time: "04/10/2026, 3:05 pm" (an audit trail entry, when a page was printed). */
export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  const h = d.getHours()
  return `${formatDate(d)}, ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`
}
