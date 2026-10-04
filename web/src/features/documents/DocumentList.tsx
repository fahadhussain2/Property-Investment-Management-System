import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadIcon, ExternalLinkIcon, FileTextIcon, ImageIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, NativeSelect } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { fetchMembers, memberKeys } from '@/features/members/api'
import { useOrg } from '@/features/org/OrgProvider'
import { formatBytes, isPreviewable } from '@/lib/files'
import { friendlyError } from '@/lib/forms'
import { categoryLabel, DOCUMENT_CATEGORIES } from '@/lib/labels'
import { deleteDocument, documentKeys, signedUrl, updateDocument, type DocumentRow } from './api'
import { recordPath } from './model'
import { editDocumentSchema } from './schema'
import { formatDate } from '@/lib/dates'


/** Opens a PDF or HEIC in a new tab. The tab opens before the link is fetched, so popup blockers allow it. */
async function openInNewTab(doc: DocumentRow) {
  const tab = window.open('', '_blank')
  try {
    const url = await signedUrl(doc.storage_path)
    if (tab) {
      tab.opener = null
      tab.location.href = url
    } else {
      window.location.href = url
    }
  } catch (e) {
    tab?.close()
    toast.error(friendlyError(e))
  }
}

async function download(doc: DocumentRow) {
  try {
    const a = document.createElement('a')
    a.href = await signedUrl(doc.storage_path, doc.file_name)
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {
    toast.error(friendlyError(e))
  }
}

/**
 * Documents as a list: open, download and (for owners and accountants) edit details or delete.
 * `showRecord` adds a link to each document's record (on the Documents page).
 */
export function DocumentList({ rows, showRecord = false }: { rows: DocumentRow[]; showRecord?: boolean }) {
  const { current, canWrite } = useOrg()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<DocumentRow | null>(null)
  const [preview, setPreview] = useState<{ doc: DocumentRow; url: string } | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: documentKeys.all(current.id) })
  // Who uploaded each document (Documents page). A member who has since left shows as "a former member".
  const members = useQuery({ queryKey: memberKeys.members(current.id), queryFn: () => fetchMembers(current.id), enabled: showRecord })
  const uploader = (uid: string | null) =>
    members.data ? (members.data.find((m) => m.user_id === uid)?.email ?? 'a former member') : null

  async function open(doc: DocumentRow) {
    if (!isPreviewable(doc.mime_type)) return openInNewTab(doc)
    try {
      setPreview({ doc, url: await signedUrl(doc.storage_path) })
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  async function remove(doc: DocumentRow) {
    if (!confirm(`Delete “${doc.title}”? The file is removed for everyone. This cannot be undone.`)) return
    try {
      await deleteDocument(doc.id)
      await refresh()
      toast.success('Document deleted')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <>
      <ul className="divide-y rounded-lg border" data-testid="document-list">
        {rows.map((d) => {
          const Icon = d.mime_type.startsWith('image/') ? ImageIcon : FileTextIcon
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5" data-testid="document-row">
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1 basis-40">
                <button
                  type="button"
                  className="block max-w-full text-left text-sm font-medium break-words hover:underline"
                  onClick={() => open(d)}
                >
                  {d.title}
                </button>
                <p className="text-xs break-words text-muted-foreground">
                  {categoryLabel(d.category)}
                  {showRecord && d.record_label && (
                    <>
                      {' · '}
                      <Link to={recordPath(d.record_type, d.record_id)} className="underline-offset-2 hover:underline">
                        {d.record_label}
                      </Link>
                    </>
                  )}
                  {' · '}
                  {showRecord && uploader(d.uploaded_by) ? `${uploader(d.uploaded_by)}, ` : ''}
                  {formatDate(d.created_at)} · {formatBytes(d.size_bytes)}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Open ${d.title}`} onClick={() => open(d)}>
                  <ExternalLinkIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Download ${d.title}`} onClick={() => download(d)}>
                  <DownloadIcon />
                </Button>
                {canWrite && (
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit details of ${d.title}`} onClick={() => setEditing(d)}>
                      <PencilIcon />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${d.title}`} onClick={() => remove(d)}>
                      <Trash2Icon />
                    </Button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit document details"
        description="The file itself can’t be changed. To replace it, upload the new one and delete this one."
        submitLabel="Save"
        schema={editDocumentSchema}
        onSubmit={async (input) => {
          await updateDocument(editing!.id, input)
          await refresh()
          toast.success('Document updated')
        }}
      >
        {(errors) => (
          <>
            <Field label="Title" name="title" defaultValue={editing?.title} maxLength={200} error={errors.title} />
            <Field label="What is it?" name="category" error={errors.category}>
              <NativeSelect id="field-category" name="category" defaultValue={editing?.category}>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        )}
      </FormDialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="break-words">{preview?.doc.title}</DialogTitle>
            <DialogDescription>
              {preview && `${categoryLabel(preview.doc.category)} · ${preview.doc.file_name}`}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <>
              <img src={preview.url} alt={preview.doc.title} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-md" />
              <Button variant="outline" onClick={() => download(preview.doc)}>
                <DownloadIcon /> Download
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
