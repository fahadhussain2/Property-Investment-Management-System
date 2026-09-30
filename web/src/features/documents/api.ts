import type { Database } from '@/lib/database.types'
import type { DocumentCategory } from '@/lib/labels'
import { safeFileName } from '@/lib/files'
import { supabase, unwrap } from '@/lib/supabase'
import type { DocLink, RecordType } from './model'

const BUCKET = 'documents'
/** Signed URLs are short-lived and never stored (spec 004 §4). */
const SIGNED_URL_SECONDS = 60

/** A documents_overview row. The view's columns are all nullable in the generated types; these never are. */
export type DocumentRow = Omit<
  Database['public']['Views']['documents_overview']['Row'],
  'id' | 'org_id' | 'category' | 'title' | 'file_name' | 'mime_type' | 'size_bytes' | 'storage_path' | 'record_type' | 'record_id' | 'created_at'
> & {
  id: string
  org_id: string
  category: DocumentCategory
  title: string
  file_name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  record_type: RecordType
  record_id: string
  created_at: string
}

export const documentKeys = {
  all: (orgId: string) => ['documents', orgId] as const,
  list: (orgId: string, link?: DocLink) => ['documents', orgId, 'list', link ?? 'all'] as const,
  used: (orgId: string) => ['documents', orgId, 'used'] as const,
}

/** Newest first; one record's documents when `link` is given. */
export async function fetchDocuments(orgId: string, link?: DocLink) {
  let q = supabase.from('documents_overview').select('*').eq('org_id', orgId)
  if (link) {
    const [[column, id]] = Object.entries(link) as [keyof DocLink & string, string][]
    q = q.eq(column as 'property_id', id)
  }
  return unwrap(await q.order('created_at', { ascending: false })) as DocumentRow[]
}

/**
 * Uploads the file to <org>/<new id>/<safe name>, then records it (add_document checks the role, the link and
 * the stored file). If recording fails, the uploaded file is removed again.
 */
export async function uploadDocument(
  orgId: string,
  link: DocLink,
  input: { file: File; fileName: string; mime: string; category: DocumentCategory; title?: string },
) {
  const id = crypto.randomUUID()
  const path = `${orgId}/${id}/${safeFileName(input.fileName)}`
  const up = await supabase.storage.from(BUCKET).upload(path, input.file, { contentType: input.mime, upsert: false })
  if (up.error) throw new Error(up.error.message)
  const res = await supabase.rpc('add_document', {
    p_org: orgId,
    p_id: id,
    p_path: path,
    p_category: input.category,
    p_title: input.title ?? '',
    p_link: link,
    p_file_name: input.fileName,
  })
  if (res.error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(res.error.message)
  }
  return id
}

export async function updateDocument(id: string, input: { title: string; category: DocumentCategory }) {
  unwrap(await supabase.rpc('update_document', { p_id: id, p_title: input.title, p_category: input.category }))
}

/** Deletes the row (logged), then the file. A failed file removal only leaves a harmless orphan (spec 004 §5). */
export async function deleteDocument(id: string) {
  const path = unwrap(await supabase.rpc('delete_document', { p_id: id }))
  await supabase.storage.from(BUCKET).remove([path])
}

/** A short-lived link to the file. With `downloadAs`, the browser saves it under that name. */
export async function signedUrl(path: string, downloadAs?: string) {
  const res = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, downloadAs ? { download: downloadAs } : undefined)
  if (res.error) throw new Error(res.error.message)
  return res.data.signedUrl
}

/** Bytes stored by the organization. */
export async function fetchStorageUsed(orgId: string) {
  return unwrap(await supabase.rpc('storage_used', { p_org: orgId })) as number
}
