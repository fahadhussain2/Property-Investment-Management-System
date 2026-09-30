import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Field, NativeSelect } from '@/components/Field'
import { FormDialog } from '@/components/FormDialog'
import { useOrg } from '@/features/org/OrgProvider'
import { compressImage } from '@/lib/compressImage'
import { ALLOWED_TYPES_LABEL, allowedMimeType, FILE_ACCEPT, fileProblem } from '@/lib/files'
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/labels'
import { documentKeys, uploadDocument } from './api'
import type { DocLink } from './model'
import { uploadSchema } from './schema'

/**
 * Upload one file to a record. Phones offer the camera through the file picker (images are accepted).
 * A large photo is shrunk first; the type and 10 MB limit are checked after that, and again by Storage.
 */
export function UploadDocumentDialog({
  open,
  onOpenChange,
  link,
  recordLabel,
  defaultCategory = 'other',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  link: DocLink
  recordLabel: string
  defaultCategory?: DocumentCategory
}) {
  const { current } = useOrg()
  const queryClient = useQueryClient()

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Upload a document"
      description={`Attach a scan, photo or PDF to ${recordLabel}.`}
      submitLabel="Upload"
      schema={uploadSchema}
      onSubmit={async ({ file, category, title }) => {
        const type = allowedMimeType(file.name, file.type)
        if (!type) throw new Error(fileProblem(file.name, file.size, file.type)!)
        const shrunk = await compressImage(file, type)
        const problem = fileProblem(shrunk.file.name, shrunk.file.size, shrunk.mime)
        if (problem) throw new Error(problem)
        await uploadDocument(current.id, link, { file: shrunk.file, fileName: shrunk.file.name, mime: shrunk.mime, category, title })
        await queryClient.invalidateQueries({ queryKey: documentKeys.all(current.id) })
        toast.success('Document uploaded')
      }}
    >
      {(errors) => (
        <>
          <Field
            label="File"
            name="file"
            type="file"
            accept={FILE_ACCEPT}
            error={errors.file}
            hint={`${ALLOWED_TYPES_LABEL}, up to 10 MB. Large photos are made smaller automatically.`}
            className="[&_input]:h-auto [&_input]:py-1.5"
            onChange={(e) => {
              // Prefill the title with the file's name (without its extension) unless one was typed.
              const title = e.currentTarget.form?.elements.namedItem('title') as HTMLInputElement | null
              const name = e.currentTarget.files?.[0]?.name
              if (title && name && (!title.value || title.dataset.prefilled === 'true')) {
                title.value = name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
                title.dataset.prefilled = 'true'
              }
            }}
          />
          <Field label="What is it?" name="category" error={errors.category}>
            <NativeSelect id="field-category" name="category" defaultValue={defaultCategory}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Title (optional)"
            name="title"
            maxLength={200}
            placeholder="Uses the file name if left blank"
            error={errors.title}
            onInput={(e) => delete e.currentTarget.dataset.prefilled}
          />
        </>
      )}
    </FormDialog>
  )
}
