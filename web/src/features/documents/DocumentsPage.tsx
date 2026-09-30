import { useQuery } from '@tanstack/react-query'
import { FolderOpenIcon, SearchIcon, XIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { NativeSelect } from '@/components/Field'
import { PageHeader } from '@/components/PageHeader'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/labels'
import { documentKeys, fetchDocuments } from './api'
import { DocumentList } from './DocumentList'
import { filterDocuments, isRecordType, RECORD_TYPES, type RecordType } from './model'

/**
 * Every document in the business (spec 004 §6). Filters live in the URL, so a record's
 * "Open in Documents" link (?record=<id>) and the browser's back button keep them.
 */
export function DocumentsPage() {
  const { current, canWrite } = useOrg()
  const [params, setParams] = useSearchParams()
  const rawCategory = params.get('category')
  const category: DocumentCategory | 'all' = DOCUMENT_CATEGORIES.some((c) => c.value === rawCategory) ? (rawCategory as DocumentCategory) : 'all'
  const rawType = params.get('type')
  const type: RecordType | 'all' = isRecordType(rawType) ? rawType : 'all'
  const record = params.get('record') ?? ''
  const q = params.get('q') ?? ''

  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value && value !== 'all') next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const list = useQuery({ queryKey: documentKeys.list(current.id), queryFn: () => fetchDocuments(current.id) })
  const rows = useMemo(() => filterDocuments(list.data ?? [], { category, type, record, q }), [list.data, category, type, record, q])
  const recordLabel = record ? list.data?.find((d) => d.record_id === record)?.record_label : null

  return (
    <>
      <PageHeader
        title="Documents"
        description={
          canWrite
            ? 'Registry papers, agreements, receipts and IDs. Upload from a property, lease, party, vehicle or entry.'
            : 'Registry papers, agreements, receipts and IDs kept with their records.'
        }
      />

      {record && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm" data-testid="record-filter">
          <span className="min-w-0 flex-1 break-words">
            Showing documents for <strong>{recordLabel ?? 'one record'}</strong>
          </span>
          <Button size="sm" variant="ghost" onClick={() => set('record', '')}>
            <XIcon /> Show all
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search documents"
            placeholder="Search title, file or record"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="pl-8"
          />
        </div>
        <NativeSelect aria-label="Filter by kind of document" value={category} onChange={(e) => set('category', e.target.value)} className="w-full sm:w-48">
          <option value="all">All kinds</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Filter by record" value={type} onChange={(e) => set('type', e.target.value)} className="w-full sm:w-40">
          <option value="all">All records</option>
          {RECORD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {list.isPending ? (
        <SectionLoading label="Loading documents…" />
      ) : list.isError ? (
        <SectionError error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={FolderOpenIcon} title="No documents yet">
          {canWrite ? 'Open a property, lease, party, vehicle or entry and use “Upload” in its Documents section.' : 'Nothing has been uploaded yet.'}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState icon={SearchIcon} title="No documents match these filters" />
      ) : (
        <DocumentList rows={rows} showRecord />
      )}
    </>
  )
}
