# Intent 001 — Core property ledger

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **APPROVED** by Fahad Hussain, 2026-09-25
> Owner: Fahad Hussain · Date: 2026-09-25

## Problem

We buy, sell and rent out properties (houses, apartments, shops, plots). Every
transaction is kept by hand in paper registers. Because of that:

- We cannot see our whole portfolio at a glance: what we own, what is rented out,
  what is listed for sale, what has been sold, and what is sitting empty.
- A single property's full financial history (what we paid, what we spent on it,
  what rent it earned, what we sold it for, what profit it made) is spread across
  several registers.
- Profit is worked out by hand. Trading profit (buy low, sell high) and rental income
  are mixed together or tracked inconsistently.
- Cash in hand and bank balances are hard to reconcile. When we withdraw from the bank,
  we lose track of what the money was spent on and when it went back in.

## Desired outcome

One simple system that replaces the registers and records **every business activity**:

1. **Every property has a complete financial history.** For example, open "DP-25" and see
   its purchase, costs, rent received, expenses, sale and net profit on one page.
2. **Profit from buying and selling is recorded automatically.** When a sale is entered,
   the system works out the profit (sale price minus total cost of the property).
3. **Rental income is tracked by property and in total.** Rent from DP-25 appears in
   DP-25's account. Rent from a shop appears in that shop's account. All rent also rolls
   up into one "Rent Income" line, and that line feeds total profit in the income statement.
4. **Cash and bank are fully tracked.** Cash in hand, each bank account, withdrawals and
   deposits, and what each rupee was spent on or received from.
5. **Portfolio view.** Owned, rented, for sale, sold and vacant properties, all in one place.

## Users

- **Now:** the owner and one or two staff members of our business (internal use).
- **Later:** other property dealers and investors who subscribe to the product (multi-tenant SaaS).

## Constraints

- **Simple.** It replaces a paper register, so it must not feel like complex accounting
  software. Users enter "what happened" (bought, sold, rent received, paid expense) and
  never touch debits and credits.
- **Free infrastructure.** Zero running cost until paying customers exist.
- **Multi-tenant from day one.** Each business's data is fully isolated from every
  other business.
- **Correct books.** The numbers must always add up. Reports must never disagree with each other.
- Must be usable on a mobile phone as well as a laptop.

## Out of scope (for now)

- Billing and subscriptions for SaaS customers
- Property listing portals, marketing and CRM pipelines
- Payroll, tax filing, bank feed integrations
- Depreciation

## Open questions (default assumption in brackets)

1. Currency and fiscal year? [PKR; fiscal year July–June; both configurable per business]
2. Are properties ever bought or sold in installments, or with token money (bayana)?
   [Yes. Partial payments, payables to sellers, receivables from buyers and advances are supported]
3. Are some properties co-owned with partners who share the profit? **Decided:** not today, possible later. Deferred to v2 because it adds complexity to every posting and report. The v1 data model must allow adding it without migrating data (see spec §7).
4. Interface language? **Decided:** English only. Urdu is dropped entirely.
5. Do we also earn commission from dealing other people's properties? [Supported as "Other income"]
6. Do we need to keep scanned documents (registry, agreements, receipts)? [v1.1, using free file storage]
7. How many years of register history do we migrate? [Opening balances as of a cut-over
   date, plus optional back-entry of properties still held]

## Approval

- [x] Product owner approves this intent → proceed to `spec.md` review
