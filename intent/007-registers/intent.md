# Intent 007 — Registers: memo ledgers outside the books

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **APPROVED** by Fahad Hussain, 2026-10-18
> Owner: Fahad Hussain · Date: 2026-10-18

## Problem

The owner keeps some money records in paper registers that are not part of the business's books: the
Zakat Distribution and Zakat Expenses ledgers (pages 112 to 115 of the Zakat register). Each page has a date,
a description (a person or a reason), money in or money out, and a running balance.

These records should live in the system, but they must not change cash in hand, bank, income, rent, profit,
the balance sheet or the dashboard. Today the system cannot do that inside one business: every entry goes
into the same books. The only workaround is a second business, which the app cannot create from the screen,
and which is more than a simple register needs.

## Desired outcome

1. **Registers.** A business can have as many registers as it wants ("Zakat Fund", "Family loan book", ...).
   Each has a name and an optional opening balance, with a date (for example the Rs 53,650 carried forward).
2. **Entries.** An entry in a register is a date, a description, and an amount that is either money in or
   money out. Only a description, no categories (decided 2026-10-18).
3. **Running balance.** Each register shows its entries with a running balance, like the paper ledger, plus the
   total in, the total out and the balance now.
4. **Corrections keep history.** An entry is never silently changed or deleted: it is voided or corrected, and the
   old entry stays visible with who changed it and when, like entries in the books (decided 2026-10-18).
5. **Export and print.** A register can be printed and downloaded as CSV, so a paper copy can still be kept.
6. **Isolated.** Nothing in a register reaches the accounting books or any report, and nothing in the books
   reaches a register. Cash, bank, profit, the balance sheet and the dashboard are unchanged by it.
7. **Own page only.** Registers appear in the menu and on their own pages. They do not appear on the
   dashboard (decided 2026-10-18).

## Users

The owner and staff, as in intent 001. Owners and accountants can record and correct entries and manage
registers; viewers can read them.

## Constraints

- **Outside the books by construction.** Registers use their own tables and never write to vouchers or
  journal lines, so no report can be affected. Rule 1 (all money moves through `post_voucher()`) is about the
  books; a register is a memo ledger and is labelled "Not part of your books" on screen.
- **Money is exact.** Amounts are `numeric(18,2)` in SQL and decimal strings in the browser (rule 4). The
  running balance is calculated, never stored (rule 5).
- **Tenant isolation.** Every table has `org_id` and row-level security; a member of another business can see
  nothing of a register.
- **Dates** show as dd/mm/yyyy.
- **Mobile.** Usable at 375 px width with no sideways scrolling.

## Out of scope (for now)

- Categories or tags on entries, and totals per category
- Any link to cash, bank, parties, properties or documents
- The yearly Zakat calculation (the "÷ 40" page); it stays manual (decided 2026-10-18)
- Showing a register on the dashboard
- Importing the existing paper register

## Decisions (agreed 2026-10-18)

1. **Separate tables, not flagged accounting entries:** the isolation is guaranteed by design, not by every
   report remembering to skip them.
2. **Void and correct with history**, not free editing.
3. **Description only** on each entry.
4. **No dashboard visibility.**
5. **No Zakat calculation helper** in the first version.

## Approval

- [x] Product owner approves this intent → proceed to `spec.md`
