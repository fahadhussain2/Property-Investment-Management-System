# Plan 004 — Documents

> Stage 3 artifact. Implements [`spec.md`](spec.md). Each milestone is one PR on its own branch and ends
> with a **verification gate** that the `verifier` subagent must pass before asking for human review.
> Status: **IN PROGRESS** · D1 ✅ merged (PR #20: 265 pgTAP, 14/14 evals) · D2 built (branch `feat/documents-ui`)

## Milestones

### D1 — Data and storage (branch `feat/documents-data`)

Database and storage only. Can merge on its own.

- `supabase/migrations/20261004000001_documents.sql`:
  - enum `document_category` (spec §2)
  - `documents` table (spec §3): the one-link check, the `storage_path` prefix check, composite FKs
    `(org_id, <link>_id)` with `on delete restrict` (these keep links inside the org), indexes
  - RLS: select for `is_member`, no direct insert/update/delete for `authenticated`. Writes go through the RPCs only.
  - Bucket `documents` inserted into `storage.buckets` (private, 10 MiB, the five mime types).
    `storage.objects` policies for select/insert/delete (spec §4), keyed on `(storage.foldername(name))[1]::uuid`.
  - RPCs `add_document` (takes the original file name), `update_document`, `delete_document` (security
    definer, `require_role`, `audit_log` on delete) and the view `documents_overview` (security_invoker), which
    adds the linked record's type, id and label for the sections and `/documents`.
  - `storage_used(p_org)`
  - Revoke/grant like the existing RPCs.
- `20261004000002_documents_edit_voucher.sql`: `create or replace edit_voucher` (base:
  `20260928000001_entry_tools.sql`, its latest definition),
  which re-points `documents.voucher_id` from the original to the replacement.
- `supabase/config.toml`: `[storage.buckets.documents]` mirror.
- CI (`.github/workflows/ci.yml`): stop excluding `storage-api` from `supabase start`, so tests and e2e can use Storage.
- `npm run db:types`.
- pgTAP `supabase/tests/12_documents.sql`:
  - the one-link check
  - cross-org links rejected
  - viewer denied on the RPCs and on `storage.objects` insert/delete
  - org B can't select org A's rows or objects
  - `add_document` rejects a missing object or a path in another org
  - size and mime type are copied from `storage.objects`
  - delete writes `audit_log`
  - an object can't be deleted while a row points at it
  - `edit_voucher` moves documents; `void` does not
  - a property with documents can't be deleted
- Evals: `14-documents-follow-edited-entry.json` (spec §9.8); extend `evals/run.mjs` with an `attach` step
  (a stub `storage.objects` row inserted as the owner, RLS on, then `add_document`) and `documents` /
  `storage_used` expectations; update `evals/README.md`.
- **Gate:** `npm run db:test`, `npm run evals` 14/14, `npm run check` (types not stale).

### D2 — UI (branch `feat/documents-ui`, after D1 merges)

- `web/src/lib/files.ts` + tests (pure, no `lib/supabase`): allowed types, `safeFileName`, size check,
  `shouldCompress`, `formatBytes`.
  `web/src/lib/compressImage.ts`: canvas resize to 2,400 px, JPEG 0.85, keep the smaller version.
- `web/src/features/documents/`:
  - `api.ts`: keys under `['documents', orgId, …]`; upload = storage upload → `add_document` → remove
    the object on failure; delete = `delete_document` → storage remove; signed URLs.
  - `schema.ts` (zod)
  - `DocumentsSection.tsx`: takes a `link` prop; list, empty state, `SectionError`
  - `UploadDocumentDialog.tsx` (`FormDialog`, camera `accept`)
  - `DocumentList.tsx`: rows, open/download, image preview, and the edit-details `FormDialog`
  - `DocumentsPage.tsx` (`/documents`: filters and search kept in the URL)
  - pure `model.ts` (links, record paths, filters) + test
- Add `DocumentsSection` to `PropertyPage`, `LeasePage`, `PartyPage`, `HoldingPage`, `EntryPage`.
- Router: `/documents`. Links on the More page and in the nav. Settings: "Storage used" line.
- `web/public/_headers`: add `https://*.supabase.co` to `img-src`.
- e2e `documents.spec.ts` + small fixtures (a 1-page PDF, a large JPEG generated in the test, an 11 MB file,
  an `.exe`). It covers:
  - upload to a property, open (signed URL), download name
  - rejections (size, type)
  - photo compressed below 2 MB
  - edit details, delete
  - viewer sees no write actions
  - receipt follows an edited entry
  - `expectNoHorizontalScroll` at 375 px on `/documents`, the property page section and the dialog
- **Gate:** `npm run check`, `npm run e2e`, plus D1's gates still green.

### D3 — Backup and close-out (branch `feat/documents-backup`)

- `scripts/backup.sh`: when `SUPABASE_S3_*` is set, sync the `documents` bucket into `$work/$name/files/`
  (AWS CLI against the Supabase S3 endpoint). The archive is encrypted as before. Report orphan objects
  (no `documents` row, over a day old) from the dump.
  `backup.yml` and `deploy.yml` pass the new secrets.
- `docs/go-live.md`: create S3 access keys; secrets `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_ACCESS_KEY_ID`,
  `SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_S3_REGION`; file restore steps; watch the 1 GB Storage
  and artifact size.
- Mark spec/plan DONE. `CLAUDE.md`: documents rules (writes only through the RPCs, signed URLs only,
  bucket limits are the real control, a new external origin goes in `_headers`).
- **Gate:** backup run locally against local Supabase produces an archive containing an uploaded file
  (spec §9.12); all gates from D1 and D2 green.
