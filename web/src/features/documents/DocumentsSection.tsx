import { useQuery } from '@tanstack/react-query'
import { UploadIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SectionError, SectionLoading } from '@/components/QueryState'
import { useOrg } from '@/features/org/OrgProvider'
import type { DocumentCategory } from '@/lib/labels'
import { documentKeys, fetchDocuments } from './api'
import { DocumentList } from './DocumentList'
import type { DocLink } from './model'
import { UploadDocumentDialog } from './UploadDocumentDialog'

/** The "Documents" section of a record's page (property, lease, party, holding or entry). */
export function DocumentsSection({
  link,
  recordLabel,
  defaultCategory,
}: {
  link: DocLink
  recordLabel: string
  defaultCategory?: DocumentCategory
}) {
  const { current, canWrite } = useOrg()
  const [uploading, setUploading] = useState(false)
  const docs = useQuery({ queryKey: documentKeys.list(current.id, link), queryFn: () => fetchDocuments(current.id, link) })
  const recordId = Object.values(link)[0]

  return (
    <section aria-labelledby="documents-heading" data-testid="documents-section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="documents-heading" className="text-sm font-semibold text-muted-foreground">
          Documents
        </h2>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => setUploading(true)}>
            <UploadIcon /> Upload
          </Button>
        )}
      </div>
      {docs.isPending ? (
        <SectionLoading label="Loading documents…" />
      ) : docs.isError ? (
        <SectionError error={docs.error} onRetry={() => docs.refetch()} />
      ) : docs.data.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <>
          <DocumentList rows={docs.data} />
          <Link to={`/documents?record=${recordId}`} className="mt-2 inline-block text-sm text-muted-foreground underline-offset-2 hover:underline">
            Open in Documents
          </Link>
        </>
      )}
      <UploadDocumentDialog
        open={uploading}
        onOpenChange={setUploading}
        link={link}
        recordLabel={recordLabel}
        defaultCategory={defaultCategory}
      />
    </section>
  )
}
