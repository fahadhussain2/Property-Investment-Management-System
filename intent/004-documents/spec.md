# Spec 004 — Documents

> Stage 2 artifact. Derived from [`intent.md`](intent.md). Delivers the "document attachments" item of
> spec 001 §10 (v1.1) and the Documents section reserved on the property page (spec 001 §6.3).
> Status: **APPROVED** by Fahad Hussain, 2026-09-30 · **DONE** 2026-09-30 (plan 004 D1–D3)

## 1. Design principle: "a file cabinet next to the books"

Files live in one **private** Supabase Storage bucket, `documents`. Each file has one row in a
`documents` table: its metadata plus a link to the **one** record it belongs to. Documents never
touch the books: no vouchers and no `journal_lines`.

| Requirement | How it falls out |
|---|---|
| Paper kept with its record | `documents` row links to exactly one property, lease, party, holding or voucher |
| Only our organization sees our files | `documents` RLS + `storage.objects` policies keyed on the org in the file's path |
| Viewers read-only | Insert/delete need owner or accountant, in the DB and in Storage |
| 10 MB, PDF and images only | Enforced by the bucket itself (`file_size_limit`, `allowed_mime_types`), not only the UI |
| Files survive a disaster | Nightly backup also copies the bucket |
| Business logic in SQL (rule 10) | Recording and deleting go through RPCs; the UI only uploads bytes and shows lists |

## 2. Glossary additions

| Term | Meaning |
|---|---|
| **Document** | One uploaded file (a scan, photo or PDF) plus its title and category. |
| **Category** | What the paper is: Registry / title deed, Sale agreement, Rent agreement, Receipt, ID card (CNIC), Photo, Other. Fixed list (enum `document_category`). |
| **Linked record** | The property, lease, party, holding (vehicle / gold / silver item) or entry the document belongs to. |

"Tenant" keeps its meaning: a renter. A tenant's ID card is a document linked to that **party**.

## 3. Data model

```
documents(
  id uuid pk, org_id uuid not null,
  category document_category not null,
  title text not null,                    -- defaults to the file name, editable
  file_name text not null,                -- original name, shown and used on download
  mime_type text not null, size_bytes bigint not null,   -- copied from storage.objects, not trusted from the client
  storage_path text not null unique,      -- <org_id>/<document_id>/<safe_file_name>
  property_id, lease_id, party_id, holding_id, voucher_id uuid null,
  uploaded_by uuid not null default auth.uid(), created_at timestamptz not null default now()
)
check (num_nonnulls(property_id, lease_id, party_id, holding_id, voucher_id) = 1)
```

- Every FK is `on delete restrict`. A record with documents can't be deleted until its documents are.
- A link to a record in a different organization is impossible: every link is a composite foreign key
  `(org_id, <record>_id)`, the same pattern as other cross-table links. `add_document` also checks it,
  with one message for "missing" and "another organization's". (Clarified at Stage 3, D1: composite keys
  instead of the trigger first drafted.)
- Indexes on `(org_id, created_at desc)` and on each link column.
- **RLS** (rule 3): select for `is_member(org_id)`. There are no write policies: insert, update and delete
  are revoked from `authenticated`, and the table is written only through the RPCs in §5, which require
  owner or accountant (`require_role`). Only `title` and `category` can be updated (`update_document()`).
  (Clarified at Stage 3, D1: stricter than the write policies first drafted.)
- `storage_path` must start with `org_id`. A check constraint enforces it.

## 4. Storage

- Bucket `documents`: `public = false`, `file_size_limit = 10 MiB`,
  `allowed_mime_types = application/pdf, image/jpeg, image/png, image/webp, image/heic`.
  Created in the migration and mirrored in `supabase/config.toml` so local and production match.
- Object path: `<org_id>/<document_id>/<safe_file_name>`. `safe_file_name` is the original name with
  anything other than letters, digits, `.`, `-` and `_` replaced by `_`, cut to 100 characters.
- `storage.objects` policies for this bucket, using the first path segment as the org id:
  - select: `is_member(org)`
  - insert: `has_role(org, '{owner,accountant}')`
  - delete: `has_role(org, '{owner,accountant}')` **and** no `documents` row still points at the object
  - no update (files are replaced by deleting and uploading again)
- No public URLs. Files are opened only through **signed URLs** (60-second expiry), which are never stored.

## 5. Flows and RPCs

**Upload** (owner / accountant):
1. The user picks a file or takes a photo, and chooses a category and title.
2. The browser shrinks large images. A JPEG, PNG or WebP over 2 MB, or with a side over 2,400 px, is
   resized to fit 2,400 px and re-encoded as JPEG (quality 0.85). The smaller of the two versions is kept.
   HEIC and PDF files are uploaded as they are.
3. The client uploads to `<org_id>/<new uuid>/<safe_file_name>`. The bucket rejects a wrong type or size.
4. The client calls `add_document(p_org, p_id, p_path, p_category, p_title, p_link jsonb, p_file_name)`,
   where `p_file_name` is the original name (the path holds the safe version). It checks:
   - the role
   - that the object exists in `storage.objects` under that org and id
   - that exactly one valid link is given, in the same org

   It then inserts the row, reading `size_bytes` and `mime_type` from `storage.objects`.
5. If step 4 fails, the client deletes the object it just uploaded.

**View / download** (any member): the client asks Storage for a signed URL. Images show inline, and
PDFs and HEIC files open in a new tab or download. The download keeps the original `file_name`.

**Edit details:** `update_document(p_id, p_title, p_category)`. The file and the link don't change.

**Delete** (owner / accountant, after a confirm dialog):
1. `delete_document(p_id)` deletes the row and writes to `audit_log`
   (`action = 'document_deleted'`, `details` = title, file name, category and link).
2. The client then removes the object.

A failed removal leaves a harmless orphan object with no row. Orphans can be listed and removed later
(see §8).

**Entries that are edited or voided** (rule 6):
- `edit_voucher` (reverse + repost) moves the original's documents to the replacement voucher, so a
  corrected entry keeps its receipt. This needs a new migration with `create or replace` (rule 9).
- A void (reversal only) leaves the documents on the original entry.
- The reversal voucher itself never gets documents.

## 6. Screens

| Where | What |
|---|---|
| Property page (`/properties/:id`) | "Documents" section: list, Upload button, and a link to the Documents page filtered to this property |
| Lease page (`/leases/:id`), party page (`/parties/:id`), vehicle / gold / silver pages, entry page (`/entries/:id`) | The same Documents section |
| **Documents** page (`/documents`, in the menu under More) | All documents: title, category, linked record (as a link), uploaded by and on, size. Filters: category and record type. Search on title. Newest first. |
| Upload dialog (`FormDialog`) | File (`accept` = the five types; phones offer the camera), category, title (prefilled with the file name without its extension). Shows the 10 MB limit and a clear error for a wrong type or size. A photo shrunk to JPEG keeps its name with `.jpg`, since that is what is stored (clarified at Stage 3, D2). |
| Settings | "Storage used: X MB of 1 GB" (Σ `size_bytes` for the organization; the 1 GB is shared by the whole project) |

- Each list row shows an icon by type (PDF / image), title, category and date, with actions Open,
  Download, Edit details and Delete. The last two are hidden when `canWrite` is false.
- An empty section says "No documents yet". A failed load shows `SectionError`, never an empty list.
- Every row and dialog works at 375 px with no sideways scroll (`grid-cols-1`, long file names wrap or truncate).
- The `/documents` page has one `<h1>` "Documents".

## 7. Security and hosting

- `web/public/_headers`: add `https://*.supabase.co` to `img-src` so images can be previewed inline from
  signed URLs. `connect-src` already allows Supabase. PDFs open in a new tab, so no `frame-src` change is needed.
- Uploaded file names are shown as text only, never as HTML.
- The bucket's type and size limits are the real control. The UI checks are for friendly errors only.

## 8. Backups and operations

- `scripts/backup.sh` (run by `backup.yml` and the pre-deploy backup) also copies the `documents` bucket,
  using the Supabase S3 protocol, into the same encrypted archive as `files/`.
- `docs/go-live.md` gets:
  - the steps to restore files
  - the S3 access keys to add as secrets
  - a note to watch the 1 GB Storage limit and the size of the GitHub artifact
- Orphan objects (no `documents` row, older than one day) are reported by the backup run. Removing
  them is a manual step for now.
- Without the S3 keys, a backup skips files only while there are no documents; once there are, it fails.
  The restore drill after `db:reset` must first drop the `documents` bucket the migrations created, because
  `data.sql` brings it back (clarified at Stage 3, D3).
- **Files are backed up weekly, not nightly** (changed by the product owner, 2026-09-30, after D3): every copy
  holds all the files and GitHub's free artifact storage is 500 MB. The nightly and pre-deploy backups are the
  database only; the weekly one (Sunday, kept 35 days) is the database plus files.

## 9. Acceptance scenarios (these become `evals/`, pgTAP and e2e)

1. An accountant uploads a PDF sale agreement to DP-25. It appears on the property page and on
   `/documents`, opens from a signed URL, and downloads under its original file name.
2. A 12 MB PDF is rejected with a clear message and no row is created.
3. An `.exe` renamed to `.pdf` is rejected by the bucket (its type is not allowed).
4. A 6 MB phone photo is uploaded as a JPEG under 2 MB.
5. A viewer sees and opens documents, but has no Upload, Edit or Delete. Direct RPC and Storage
   calls as a viewer fail.
6. A member of org B cannot list org A's documents rows, cannot download or sign org A's objects, and
   cannot upload into org A's path (pgTAP, cross-org).
7. `add_document` fails when the link points at another organization's property, when no link or two
   links are given, or when the object doesn't exist.
8. A receipt is attached to a rent entry. The entry is edited from 50,000 to 55,000. The receipt now
   shows on the replacement entry.
9. A document is deleted. The row and the object are both gone, and `audit_log` has the entry.
10. A property that has documents can't be deleted until they are.
11. The Documents section and page have no sideways scroll at 375 px.
12. After a backup run, the archive contains the uploaded file.

## 10. Roadmap

- Later: expiry reminders (e.g. rent agreement renewal), OCR / search inside files, versions,
  per-organization storage limits (with v2 plans and billing).

## Approval

- [x] Product owner approves this spec → proceed to `plan.md`
