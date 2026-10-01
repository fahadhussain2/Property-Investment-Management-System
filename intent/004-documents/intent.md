# Intent 004 — Documents

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **APPROVED** by Fahad Hussain, 2026-09-30
> Owner: Fahad Hussain · Date: 2026-09-30

## Problem

The books record what happened, but the papers behind each deal are kept somewhere else: registry
and title papers, sale agreements, rent agreements, receipts, tenants' and sellers' ID cards, and
vehicle files. They are in cupboards, on phones and in WhatsApp chats. When we need one (a dispute
with a tenant, a sale, a tax question) we have to hunt for it, and a lost paper is hard to replace.

Spec 001 planned this for v1.1 ("document attachments", and a Documents section on the property page).
We need it now, ahead of the other v1.1 items (rent accrual, period lock), which are deferred.

## Desired outcome

1. **Every paper is kept with its record.** A document can be attached to a property, a lease, a
   party, a vehicle / gold / silver item, or an entry (for example the receipt for a payment).
2. **Easy from a phone.** Take a photo of a paper or pick a PDF, choose what kind of document it is,
   and save. Large photos are made smaller automatically.
3. **Easy to find.** Each record shows its documents. One Documents page lists them all, with
   filters and a search.
4. **Private.** Only members of our organization can see our files. Viewers can open and download
   files but cannot add or delete them.
5. **Safe.** Files are included in the weekly backup; the books are backed up nightly.

## Users

Same as intent 001: the owner and staff now, subscribing businesses later.

## Constraints

- **Free infrastructure.** Supabase Storage free tier (1 GB for the whole project). Files are limited
  to 10 MB each. PDF and common image types only.
- **Tenant isolation.** One organization can never see or reach another's files.
- **Books are untouched.** Documents never create or change entries.
- **Mobile.** Usable at 375 px width with no sideways scrolling.

## Out of scope (for now)

- Reading text out of scans (OCR) or searching inside files
- Keeping several versions of the same document
- Sharing a file with someone outside the organization
- Reminders when a paper expires (e.g. a rent agreement due for renewal)
- Storage limits or billing per organization

## Decisions (agreed 2026-09-30)

1. Documents attach to **properties, leases, parties, holdings and entries**, one record per document.
2. **10 MB per file.** Allowed types: PDF, JPG, PNG, WebP, HEIC.
3. **Uploaded files are added to the encrypted backup** (weekly; changed from nightly on 2026-09-30 to fit
   GitHub's free backup storage).

## Approval

- [x] Product owner approves this intent → proceed to `spec.md` review
