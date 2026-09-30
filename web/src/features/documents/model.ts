// Documents (spec 004): pure helpers for lists and links. No lib/supabase import, so unit tests need no env.
import { HOLDING_CLASSES, type DocumentCategory } from '@/lib/labels'

/** The one record a document belongs to, as add_document takes it. */
export type DocLink =
  | { property_id: string }
  | { lease_id: string }
  | { party_id: string }
  | { holding_id: string }
  | { voucher_id: string }

/** documents_overview.record_type: a holding shows its class. */
export type RecordType = 'property' | 'lease' | 'party' | 'vehicle' | 'gold' | 'silver' | 'entry'

export const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: 'property', label: 'Properties' },
  { value: 'lease', label: 'Leases' },
  { value: 'party', label: 'Parties' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'entry', label: 'Entries' },
]
export const isRecordType = (v: unknown): v is RecordType => RECORD_TYPES.some((t) => t.value === v)

/** Where the linked record lives in the app. */
export function recordPath(type: string, id: string): string {
  switch (type) {
    case 'property':
      return `/properties/${id}`
    case 'lease':
      return `/leases/${id}`
    case 'party':
      return `/parties/${id}`
    case 'vehicle':
    case 'gold':
    case 'silver':
      return `${HOLDING_CLASSES[type].path}/${id}`
    default:
      return `/entries/${id}`
  }
}

/** The subset of a documents_overview row the Documents page filters on. */
export type FilterableDocument = {
  title: string
  file_name: string
  category: DocumentCategory
  record_type: string
  record_id: string
  record_label: string | null
}

export type DocumentFilters = { category?: DocumentCategory | 'all'; type?: RecordType | 'all'; record?: string; q?: string }

export function filterDocuments<T extends FilterableDocument>(rows: T[], f: DocumentFilters): T[] {
  const needle = (f.q ?? '').trim().toLowerCase()
  return rows.filter(
    (d) =>
      (!f.category || f.category === 'all' || d.category === f.category) &&
      (!f.type || f.type === 'all' || d.record_type === f.type) &&
      (!f.record || d.record_id === f.record) &&
      (!needle ||
        d.title.toLowerCase().includes(needle) ||
        d.file_name.toLowerCase().includes(needle) ||
        (d.record_label ?? '').toLowerCase().includes(needle)),
  )
}
