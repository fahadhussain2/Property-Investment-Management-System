import { canCompress, COMPRESS_MAX_SIDE, COMPRESS_OVER_BYTES, fitWithin, withExtension } from './files'

/**
 * Shrinks a large JPEG, PNG or WebP photo before upload (spec 004 §5): over 2 MB, or a side over 2,400 px,
 * becomes a JPEG (quality 0.85) that fits 2,400 px. Keeps whichever of the two files is smaller.
 * Anything else (PDF, HEIC, or an image the browser can't decode) is returned unchanged.
 */
export async function compressImage(file: File, mime: string): Promise<{ file: File; mime: string }> {
  if (!canCompress(mime)) return { file, mime }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { file, mime }
  }
  try {
    if (file.size <= COMPRESS_OVER_BYTES && Math.max(bitmap.width, bitmap.height) <= COMPRESS_MAX_SIDE) return { file, mime }
    const { width, height } = fitWithin(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { file, mime }
    // JPEG has no transparency: paint white first so transparent PNG areas don't turn black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return { file, mime }
    return { file: new File([blob], withExtension(file.name, 'jpg'), { type: 'image/jpeg' }), mime: 'image/jpeg' }
  } finally {
    bitmap.close()
  }
}
