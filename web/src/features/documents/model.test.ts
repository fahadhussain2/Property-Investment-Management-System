import { describe, expect, it } from 'vitest'
import { filterDocuments, recordPath, type FilterableDocument } from './model'

const doc = (d: Partial<FilterableDocument>): FilterableDocument => ({
  title: 'Doc',
  file_name: 'doc.pdf',
  category: 'other',
  record_type: 'property',
  record_id: 'p1',
  record_label: 'DP-25 · House',
  ...d,
})

describe('documents', () => {
  it('links each record type to its page', () => {
    expect(recordPath('property', 'x')).toBe('/properties/x')
    expect(recordPath('lease', 'x')).toBe('/leases/x')
    expect(recordPath('party', 'x')).toBe('/parties/x')
    expect(recordPath('vehicle', 'x')).toBe('/vehicles/x')
    expect(recordPath('gold', 'x')).toBe('/gold/x')
    expect(recordPath('silver', 'x')).toBe('/silver/x')
    expect(recordPath('entry', 'x')).toBe('/entries/x')
  })

  it('filters by category, record type, one record and a search', () => {
    const rows = [
      doc({ title: 'Registry', category: 'registry' }),
      doc({ title: 'Receipt', category: 'receipt', record_type: 'entry', record_id: 'v1', record_label: 'RNT-0001' }),
      doc({ title: 'CNIC', category: 'id_card', record_type: 'party', record_id: 't1', record_label: 'Tenant T' }),
    ]
    expect(filterDocuments(rows, {}).map((d) => d.title)).toEqual(['Registry', 'Receipt', 'CNIC'])
    expect(filterDocuments(rows, { category: 'receipt' }).map((d) => d.title)).toEqual(['Receipt'])
    expect(filterDocuments(rows, { type: 'party' }).map((d) => d.title)).toEqual(['CNIC'])
    expect(filterDocuments(rows, { record: 'p1' }).map((d) => d.title)).toEqual(['Registry'])
    // Search matches the title, the file name or the linked record.
    expect(filterDocuments(rows, { q: 'tenant' }).map((d) => d.title)).toEqual(['CNIC'])
    expect(filterDocuments(rows, { q: 'DOC.PDF' })).toHaveLength(3)
    expect(filterDocuments(rows, { category: 'all', type: 'all', q: '  ' })).toHaveLength(3)
  })
})
