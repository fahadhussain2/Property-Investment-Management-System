#!/usr/bin/env node
// Puts backed-up documents back into the `documents` Storage bucket (spec 004 §8; docs/go-live.md §5).
// Restore the database first: its data.sql already holds the documents rows. Existing files are overwritten.
// Usage: node scripts/restore-files.mjs <unpacked backup folder>   (reads <folder>/files/manifest.tsv)
// Needs SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY of the target project.
import fs from 'node:fs'
import path from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const BUCKET = 'documents'
const folder = process.argv[2]
if (!folder) throw new Error('usage: node scripts/restore-files.mjs <unpacked backup folder>')
const { SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY } = process.env
for (const [k, v] of Object.entries({ SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY })) {
  if (!v) throw new Error(`set ${k}`)
}

const dir = path.join(folder, 'files')
const manifestPath = path.join(dir, 'manifest.tsv')
if (!fs.existsSync(manifestPath)) {
  console.log('This backup has no files (no documents had been uploaded). Nothing to restore.')
  process.exit(0)
}
const rows = fs.readFileSync(manifestPath, 'utf8').trim().split('\n').slice(1).filter(Boolean).map((l) => l.split('\t'))

const s3 = new S3Client({
  endpoint: SUPABASE_S3_ENDPOINT,
  region: SUPABASE_S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: SUPABASE_S3_ACCESS_KEY_ID, secretAccessKey: SUPABASE_S3_SECRET_ACCESS_KEY },
})

let n = 0
for (const [key, , contentType] of rows) {
  const file = path.join(dir, ...key.split('/'))
  // Only files inside the backup's files/ folder, whatever the manifest says.
  if (!path.resolve(file).startsWith(path.resolve(dir) + path.sep)) throw new Error(`unsafe key in manifest: ${key}`)
  const body = fs.readFileSync(file)
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType || undefined }))
  n++
}
console.log(`Restored ${n} files into the ${BUCKET} bucket.`)
