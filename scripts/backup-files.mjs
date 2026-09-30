#!/usr/bin/env node
// Copies every file in the `documents` Storage bucket into a backup folder (spec 004 §8). Run by backup.sh.
// Usage: node scripts/backup-files.mjs <backup folder>   → <folder>/files/<org>/<document>/<name> + files/manifest.tsv
//
// Needs SUPABASE_DB_URL, and the Storage S3 keys: SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION,
// SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY (docs/go-live.md §3).
// Without the keys it skips the files only while there are no documents; once there are, it fails, so a
// nightly backup can never leave files out silently.
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import pg from 'pg'

const BUCKET = 'documents'
const out = process.argv[2]
if (!out) throw new Error('usage: node scripts/backup-files.mjs <backup folder>')
const { SUPABASE_DB_URL, SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY } = process.env
if (!SUPABASE_DB_URL) throw new Error('set SUPABASE_DB_URL')

const db = new pg.Client({ connectionString: SUPABASE_DB_URL })
await db.connect()
const recorded = (await db.query('select storage_path from public.documents')).rows.map((r) => r.storage_path)
const count = recorded.length
// Orphans are harmless but worth knowing about (spec 004 §5): files left by a failed removal, and rows whose file is gone.
const orphanFiles = (
  await db.query(
    `select o.name from storage.objects o
     where o.bucket_id = $1 and o.created_at < now() - interval '1 day'
       and not exists (select 1 from public.documents d where d.storage_path = o.name)
     order by o.name`,
    [BUCKET],
  )
).rows.map((r) => r.name)
const missingFiles = (
  await db.query(
    `select d.storage_path from public.documents d
     where not exists (select 1 from storage.objects o where o.bucket_id = $1 and o.name = d.storage_path)
     order by d.storage_path`,
    [BUCKET],
  )
).rows.map((r) => r.storage_path)
await db.end()

for (const name of orphanFiles) console.log(`::warning::Orphan file (no document row, over a day old): ${name}`)
for (const name of missingFiles) console.log(`::warning::Document row whose file is missing from Storage: ${name}`)

const keys = [SUPABASE_S3_ENDPOINT, SUPABASE_S3_REGION, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY]
if (keys.some((k) => !k)) {
  if (count > 0) {
    console.log(`::error::${count} documents are stored but the SUPABASE_S3_* secrets are not set, so their files can't be backed up (docs/go-live.md §3).`)
    process.exit(1)
  }
  console.log('No documents yet and no Storage keys set: skipping files.')
  process.exit(0)
}

const s3 = new S3Client({
  endpoint: SUPABASE_S3_ENDPOINT,
  region: SUPABASE_S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: SUPABASE_S3_ACCESS_KEY_ID, secretAccessKey: SUPABASE_S3_SECRET_ACCESS_KEY },
})

const dir = path.join(out, 'files')
fs.mkdirSync(dir, { recursive: true })
const manifest = []
let token
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }))
  for (const obj of page.Contents ?? []) {
    const target = path.join(dir, ...obj.Key.split('/'))
    if (!path.resolve(target).startsWith(path.resolve(dir) + path.sep)) throw new Error(`unsafe object key: ${obj.Key}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }))
    await pipeline(res.Body, fs.createWriteStream(target))
    const size = fs.statSync(target).size
    if (size !== obj.Size) throw new Error(`${obj.Key}: downloaded ${size} bytes, expected ${obj.Size}`)
    manifest.push(`${obj.Key}\t${size}\t${res.ContentType ?? ''}`)
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined
} while (token)

fs.writeFileSync(path.join(dir, 'manifest.tsv'), ['key\tbytes\tcontent_type', ...manifest].join('\n') + '\n')
console.log(`Backed up ${manifest.length} files (${count} documents recorded).`)
// Every recorded document whose file exists must be in the backup (orphan files can't make up for one).
const copied = new Set(manifest.map((line) => line.split('\t')[0]))
const missing = new Set(missingFiles)
const notCopied = recorded.filter((p) => !missing.has(p) && !copied.has(p))
if (notCopied.length) {
  for (const p of notCopied) console.log(`::error::Document file was not backed up: ${p}`)
  process.exit(1)
}
