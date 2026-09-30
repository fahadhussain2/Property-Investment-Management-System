// Uploaded files (spec 004). Pure: no lib/supabase import, so unit tests need no env.
// The Storage bucket enforces the same limits; these checks only give friendly errors first.

export const MAX_FILE_BYTES = 10 * 1024 * 1024
/** Images over this size, or with a side over COMPRESS_MAX_SIDE, are shrunk in the browser before upload. */
export const COMPRESS_OVER_BYTES = 2 * 1024 * 1024
export const COMPRESS_MAX_SIDE = 2400

const TYPES: Record<string, { ext: string[] }> = {
  'application/pdf': { ext: ['pdf'] },
  'image/jpeg': { ext: ['jpg', 'jpeg'] },
  'image/png': { ext: ['png'] },
  'image/webp': { ext: ['webp'] },
  'image/heic': { ext: ['heic'] },
}

/** For <input accept>: MIME types plus extensions (some systems give HEIC files no type). */
export const FILE_ACCEPT = [...Object.keys(TYPES), ...Object.values(TYPES).flatMap((t) => t.ext.map((e) => `.${e}`))].join(',')
export const ALLOWED_TYPES_LABEL = 'PDF, JPG, PNG, WebP or HEIC'

const extension = (name: string) => /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1].toLowerCase() ?? ''

/** The file's allowed MIME type, from its reported type or else its extension; null if not allowed. */
export function allowedMimeType(name: string, type: string): string | null {
  if (type && TYPES[type]) return type
  if (type && type !== 'application/octet-stream') return null
  const ext = extension(name)
  return Object.entries(TYPES).find(([, t]) => t.ext.includes(ext))?.[0] ?? null
}

/** Plain-language problem with a file, or null when it can be uploaded. */
export function fileProblem(name: string, size: number, type: string): string | null {
  if (!name || size === 0) return 'Choose a file.'
  if (!allowedMimeType(name, type)) return `This type of file can’t be kept. Use ${ALLOWED_TYPES_LABEL}.`
  if (size > MAX_FILE_BYTES) return `This file is ${formatBytes(size)}. The limit is 10 MB.`
  return null
}

/** Whether an image can be shrunk in the browser (most browsers can't decode HEIC; PDFs aren't images). */
export const canCompress = (mime: string) => mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp'

/** Size to draw an image at so its longer side is at most `max`; unchanged if already small enough. */
export function fitWithin(width: number, height: number, max = COMPRESS_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * The name used in the storage path: letters, digits, '.', '-' and '_' only, at most 100 characters,
 * keeping the extension. The original name is stored separately and used on download.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
  const ext = extension(cleaned)
  // No leading dots or underscores (no hidden or "../" names), none trailing before the extension.
  const base = (ext ? cleaned.slice(0, -(ext.length + 1)) : cleaned).replace(/^[._]+|[._]+$/g, '')
  const keep = 100 - (ext ? ext.length + 1 : 0)
  return (base.slice(0, keep) || 'file') + (ext ? `.${ext}` : '')
}

/** Swaps a file name's extension (after compressing an image to JPEG). */
export function withExtension(name: string, ext: string): string {
  const dot = name.lastIndexOf('.')
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`
}

/** "850 KB", "1.2 MB". File sizes are counts of bytes, not money, so plain numbers are fine here. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace(/\.?0+$/, '')} GB`
}

/** Images the browser can show inline (HEIC mostly can't: it opens in a new tab or downloads). */
export const isPreviewable = (mime: string) => canCompress(mime)
