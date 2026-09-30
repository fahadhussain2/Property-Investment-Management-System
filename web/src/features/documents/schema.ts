import { z } from 'zod'
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/labels'

const category = z.enum(DOCUMENT_CATEGORIES.map((c) => c.value) as [DocumentCategory, ...DocumentCategory[]], {
  error: 'Choose what this document is',
})

export const uploadSchema = z.object({
  // FormData gives an empty File when nothing was picked. Type and size are checked in the dialog, after
  // a large photo has been shrunk, so a 12 MB phone photo isn't rejected before it gets the chance.
  file: z.instanceof(File, { error: 'Choose a file' }).refine((f) => f.size > 0 && f.name !== '', 'Choose a file'),
  category,
  title: z.string().trim().max(200, 'Keep the title under 200 characters').optional(),
})

export const editDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200, 'Keep the title under 200 characters'),
  category,
})

export type UploadInput = z.infer<typeof uploadSchema>
export type EditDocumentInput = z.infer<typeof editDocumentSchema>
