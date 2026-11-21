# Intent 008 — Loans: money borrowed from someone and repaid later

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **APPROVED** by Fahad Hussain, 2026-11-21
> Owner: Fahad Hussain · Date: 2026-11-21

## Problem

The business sometimes borrows money from a person to invest, and repays it later. The system has no way to
record this. Recording it as the owner's capital would treat it as the owner's own money; recording the repayment
as an expense would count it as a cost and make profit wrong. Nothing shows who is owed what.

## Desired outcome

1. **Record a loan received:** a lender, a date, an amount and the cash or bank account it went into.
2. **Record a repayment:** a lender, a date, an amount and the account it was paid from, in full or in part.
3. **See what is owed:** per lender, the amount borrowed, repaid and still owed; and the total owed.
4. **A statement per lender,** like the party statement: every loan and repayment with a running balance.
5. **Profit is untouched.** A loan is not income and a repayment is not an expense. Cash and bank go up and down;
   the balance sheet shows the debt as a liability.

## Users

The owner and staff, as in intent 001. Owners and accountants record; viewers read.

## Constraints

- Goes through `post_voucher()` like every other money movement (rule 1), so books, balance sheet and
  trial balance stay correct, and an entry can be edited or voided like any other.
- Money is exact (rule 4). The balance owed is computed, never stored (rule 5).
- Tenant isolation as everywhere (rule 3). Dates show as dd/mm/yyyy. Usable at 375 px.

## Out of scope

- **Interest or profit share** (decided 2026-11-21: the lender charges none).
- Due dates, instalment schedules and reminders.
- Money the business lends to others.
- Forgiven or written-off loans; loans in gold, silver or other non-cash form.
- Attaching documents to a loan.

## Approval

- [x] Product owner approves this intent → proceed to `spec.md`
