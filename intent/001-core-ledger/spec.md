# Spec 001 — Core property ledger

> Stage 2 artifact. Derived from [`intent.md`](intent.md).
> Status: **APPROVED** by Fahad Hussain, 2026-09-25

## 1. Design principle: "register on the outside, double-entry on the inside"

Users record **business events** ("Bought DP-25", "Rent received from shop 4",
"Withdrew cash from Meezan") using simple forms. Each form is a **voucher**. The
system turns every voucher into a balanced **double-entry journal**, and every
journal line can be tagged with a **property** and a **party**.

With this one design, every requirement comes out of the same data:

| Requirement | How it falls out |
|---|---|
| Complete history per property | All journal lines tagged `property_id = DP-25` |
| Automatic buy/sell profit | The sale voucher auto-posts the property's cost against the sale price |
| Rent tracked per property **and** in total | One "Rent Income" account, with each line tagged by property |
| Cash / bank book | Journal lines on cash and bank accounts, with a running balance |
| Income statement, balance sheet | Standard roll-up of the accounts |
| Numbers always agree | Every voucher is balanced, which the database enforces |

## 2. Core concepts (glossary)

| Term | Meaning |
|---|---|
| **Organization** | A business using the system (the SaaS "tenant"). All data belongs to exactly one organization. |
| **Member** | A user who belongs to an organization. Role: `owner`, `accountant` or `viewer`. |
| **Property** | An asset we buy, sell or rent: house, apartment, shop, plot, office, other. Identified by a short code, e.g. `DP-25`. |
| **Party** | A person or company we deal with. Roles: seller, buyer, tenant (renter), agent, partner, other. |
| **Lease** | A property rented to a party: rent amount, start and end dates, security deposit. |
| **Account** | A head of account in the chart of accounts (Cash in Hand, Meezan Bank, Rent Income, …). |
| **Voucher** | One business event entered by a user. It has a type, date, amount, property, party and memo. |
| **Journal line** | A debit or credit on an account, produced from a voucher. |

> "Tenant" in the UI always means a **renter**. The SaaS customer is always an
> **organization**. The code follows the same rule.

## 3. Property lifecycle

```
            ┌──────────── list for sale ────────────┐
            ▼                                       │
[Purchased] → VACANT ⇄ RENTED (active lease) ⇄ FOR_SALE → UNDER_AGREEMENT → SOLD
                     (lease ends → VACANT)         (advance/token received)  (sale voucher)
```

- `VACANT`: owned and neither rented nor listed (the "sitting unused" list).
- `RENTED`: set automatically while a lease is active.
- `FOR_SALE`: set by hand ("List for sale", with an asking price). A property can be rented **and** for sale at once, so `for_sale` is a flag and not an exclusive status.
- `UNDER_AGREEMENT`: set automatically when a buyer advance or token is recorded.
- `SOLD`: set automatically by the sale voucher. The property stays in history forever.

## 4. Chart of accounts (seeded for every new organization; users can add more)

| Code | Account | Type | Notes |
|---|---|---|---|
| 1000 | Cash in Hand | Asset (cash) | More cash accounts can be added |
| 1100 | *Bank accounts* | Asset (bank) | One account per bank account the user adds |
| 1200 | Properties at Cost | Asset | Purchase price plus capitalized costs, tagged per property |
| 1300 | Receivable from Buyers | Asset | Unpaid balances from sales |
| 1310 | Rent Receivable | Asset | v1.1 (monthly rent accrual) |
| 2000 | Payable to Sellers | Liability | Unpaid balances on purchases |
| 2100 | Advances from Buyers | Liability | Token money (bayana) received before a sale completes |
| 2200 | Security Deposits Held | Liability | Tenant deposits |
| 2300 | Loans Payable | Liability | |
| 3000 | Owner's Capital | Equity | |
| 3100 | Owner's Drawings | Equity | |
| 3200 | Opening Balance Equity | Equity | Used only at go-live |
| 3300 | Retained Earnings | Equity | Year-end close (computed) |
| 4000 | Property Sales | Income | Sale price |
| 5000 | Cost of Properties Sold | Contra-income (COGS) | Posted automatically on sale |
| 4100 | Rent Income | Income | Always tagged with a property |
| 4200 | Commission Income | Income | |
| 4900 | Other Income | Income | |
| 6000–6099 | Property Expenses (Maintenance, Utilities, Property Tax, Society Charges) | Expense | Usually tagged with a property |
| 6100 | Selling Expenses (brokerage paid on sale) | Expense | Tagged with a property |
| 6500–6999 | Office and General Expenses | Expense | |

Money is stored as `numeric(18,2)`. Each organization has one currency (default PKR).
Floats are never used.

## 5. Voucher types and their automatic journal entries

The user fills the **Form fields**. The **Posting** column shows what the system
generates. `X` is the cash or bank account the user picks. `[P]` means "tagged with
the property" and `[Pty]` means "tagged with the party".

| # | Voucher | Form fields | Posting |
|---|---|---|---|
| V1 | **Purchase property** | property (new or existing), seller, date, price `P`, paid now `A` from `X` | Dr Properties at Cost [P] `P` · Cr `X` `A` · Cr Payable to Sellers [P,Pty] `P−A` (if > 0) |
| V2 | **Property cost** (registry, transfer fee, renovation, brokerage on purchase) | property, amount, from `X`, category | Dr Properties at Cost [P] · Cr `X`. Increases the property's cost basis |
| V3 | **Pay seller balance** | property, seller, amount, from `X` | Dr Payable to Sellers [P,Pty] · Cr `X` |
| V4 | **Advance / token from buyer** | property, buyer, amount, into `X` | Dr `X` · Cr Advances from Buyers [P,Pty]. Status becomes `UNDER_AGREEMENT` |
| V5 | **Sell property** | property, buyer, date, sale price `S`, received now `R` into `X` | Dr `X` `R` · Dr Advances from Buyers [P,Pty] (existing advances applied) · Dr Receivable from Buyers [P,Pty] (balance) · Cr Property Sales [P] `S` **+ auto:** Dr Cost of Properties Sold [P] `C` · Cr Properties at Cost [P] `C`, where `C` = the property's full cost balance at posting time. Costs cannot be added to a sold property. Status becomes `SOLD`. **Profit `S − C` is shown on confirmation** |
| V6 | **Receive buyer balance** | property, buyer, amount, into `X` | Dr `X` · Cr Receivable from Buyers [P,Pty] |
| V7 | **Rent received** | lease (or property + tenant), period (month/s), amount, into `X` | Dr `X` · Cr Rent Income [P,Pty] |
| V8 | **Security deposit received / refunded** | lease, amount, `X` | Dr `X` · Cr Security Deposits Held [P,Pty] (a refund reverses this) |
| V9 | **Expense** | category account, amount, from `X`, optional property | Dr Expense [P?] · Cr `X` |
| V10 | **Other income** | category account, amount, into `X`, optional property/party | Dr `X` · Cr Income [P?] |
| V11 | **Transfer** (bank withdrawal, deposit, bank-to-bank) | from `X1`, to `X2`, amount | Dr `X2` · Cr `X1` |
| V12 | **Capital in / drawings** | amount, `X` | Dr `X` · Cr Owner's Capital, *or* Dr Owner's Drawings · Cr `X` |
| V13 | **Opening balances** (go-live) | cash/bank balances, properties still held at cost, open receivables and payables | Dr/Cr each item · balancing line to Opening Balance Equity |
| V14 | **General journal** (owner/accountant only) | free lines | As entered. Must balance |

**"What did we do with the money we withdrew?"** is answered by V11 (bank → cash),
followed by vouchers paid **from Cash in Hand** (V1/V2/V9). The Cash Book then shows
the withdrawal coming in and each use going out. Money going back to the bank is another V11.

### Corrections

Posted vouchers are never silently changed. **Edit** creates a reversal of the original
plus a new corrected voucher, in one step, and links both. **Void** creates a reversal
only. Every change is recorded in an audit log (who, when, before, after).
Users see a clean history, and the books stay provable.

## 6. Screens

1. **Dashboard.** Cash in hand, each bank balance, total cash position; portfolio counts
   (owned / rented / for sale / under agreement / vacant / sold); property investment at
   cost; profit this month and this year (trading profit, rent, other income, expenses);
   recent vouchers; leases expiring soon.
2. **Properties register.** A filterable list by status, type and area, with code, name,
   status, cost basis, rent/month, asking price and realized profit.
3. **Property page (360°).** Details and status actions (list for sale, add lease, sell);
   KPIs (total cost, rent earned, expenses, sale price, **net profit**, ROI %); a timeline
   of every voucher for the property; lease history; documents (v1.1).
4. **New entry.** One "+ New" button leads to a list of plain-language actions
   (Bought a property, Sold a property, Received rent, Paid an expense, Moved money
   between cash and bank, …). Each opens the matching voucher form.
5. **Cash & Bank.** A book per account with running balances (the digital cash book and
   bank book), filtered by date.
6. **Parties.** Party list, plus a party ledger (what we owe them and what they owe us).
7. **Leases / Rent roll.** Active leases, rent/month, last rent received, months unpaid
   (computed from the lease and receipts).
8. **Reports.** Income statement, balance sheet, trial balance, property profitability
   (all properties in one table), rent income by property, expense by category, and an
   account ledger. All support a date range, print and CSV export.
9. **Settings.** Organization profile, currency, fiscal year, members and roles,
   chart of accounts, bank accounts.

### Income statement layout (required)

```
Property trading
  Property sales                              S
  Less: cost of properties sold              (C)
  Gross profit on property trading            S − C
Rent income                                   R      ← expandable: DP-25, Shop 4, …
Commission & other income                     O
Total income                                  (S − C) + R + O
Expenses
  Property expenses (by category)            (E1)
  Selling expenses                           (E2)
  Office & general                           (E3)
Net profit                                    Total income − expenses
```

## 7. Architecture (zero cost)

| Layer | Choice | Free tier | Why |
|---|---|---|---|
| Frontend | **React + TypeScript + Vite**, Tailwind CSS, shadcn/ui, TanStack Query, React Router | — | Simple SPA, fast, huge ecosystem, Claude writes it well |
| Hosting | **Cloudflare Pages** | Unlimited bandwidth and requests for static sites; **commercial use allowed** | Vercel's free Hobby plan forbids commercial use, so Cloudflare is safe once we sell |
| Backend + DB | **Supabase** (Postgres 17, Auth, Row-Level Security, Storage) | 500 MB DB, 50k monthly users, 1 GB files, 2 projects | Real Postgres gives true double-entry integrity. RLS provides multi-tenancy. There is no server to run |
| Business logic | **Postgres functions (RPC)**, e.g. `post_voucher()` | — | Posting is atomic, inside the DB, and cannot be bypassed by the UI |
| Email (auth invites/resets) | Supabase's built-in email, later **Resend** SMTP | 3,000 emails/mo | The built-in sender is rate-limited. Resend removes that limit |
| CI/CD, backups | **GitHub Actions** (private repo) | 2,000 min/mo | Tests, deploy, nightly `pg_dump` backup, keep-alive ping |
| Local dev | Supabase CLI + Docker | — | Full local stack; DB tests with pgTAP |

**Known free-tier caveats (and fixes):**
- Supabase pauses free projects after 7 days without activity. Fix: daily use, plus a
  GitHub Actions keep-alive query.
- The Supabase free tier has no point-in-time recovery. Fix: a nightly `pg_dump` to
  encrypted GitHub Actions artifacts or a private backup repo.
- When paying customers arrive, upgrade to Supabase Pro (~$25/mo). No code changes are needed.

### Multi-tenancy

- **Shared database, shared schema.** Every business table has `org_id uuid not null`.
- **RLS on every table:** `org_id in (select org_id from memberships where user_id = auth.uid())`.
  Writes also check role (`viewer` is read-only).
- Journal posting runs only through `post_voucher()`. It checks membership and role,
  validates the voucher, writes the voucher and its lines, and updates property status,
  all in one transaction.
- A deferred constraint trigger guarantees `sum(debit) = sum(credit)` per voucher.
- Voucher numbers are sequential **per organization, per type** (PUR-0001, SAL-0001, RNT-0001, …).
- Sign-up creates an organization, makes the user its `owner` and seeds the chart of accounts.
- Each organization has a time zone (default Asia/Karachi). "Today" for status and leases is the
  organization's date, not the server's (UTC).
- **Invitations (no server, no email sending):** an owner records `invitations(email, role)` and shares
  a `/signup?email=…` link (e.g. on WhatsApp). On sign-in, `accept_invitations()` turns pending invites
  for the caller's **confirmed** email into memberships. An organization always keeps at least one owner.

### Data model (tables)

`organizations`, `memberships`, `accounts` (bank details are columns on bank accounts), `parties`,
`properties`, `leases`, `vouchers`, `journal_lines`, `audit_log`, `voucher_sequences`.
Property status is **derived** (from sale vouchers, buyer advances and active leases), not stored.
**Co-ownership readiness (v2):** partner shares will be added as a separate
`property_owners` table plus a profit-allocation voucher. v1 must not assume 100% ownership
anywhere except the report layer (no ownership columns hard-coded into posting).

Reports are **SQL views / RPCs** over `journal_lines`. Balances are computed from
the journal lines, never stored separately.

## 8. Non-functional requirements

- **Integrity:** the trial balance is zero at all times, and every report reconciles to it.
- **Isolation:** no query can read or write another organization's data. This is proven by automated tests.
- **Mobile-first layout.** All entry forms are usable on a 375 px wide screen.
- **Speed:** every page loads in under 1 s for 10k vouchers.
- **Audit:** every voucher records who created, edited or voided it, and when.
- **Backups:** nightly, kept for 30 days.

## 9. Acceptance scenarios (these become `evals/`)

1. Buy DP-25 for 10,000,000 (paying 4,000,000 now from Meezan and owing 6,000,000), pay
   200,000 transfer fee in cash, and then sell it for 12,500,000.
   Expected: DP-25 net profit is **2,300,000**; income statement gross trading profit
   is **2,300,000**; the property's status is SOLD.
2. Shop-4 is rented at 50,000/month and DP-25 at 80,000/month. Receive 3 months each.
   Expected: Rent Income is **390,000** in total; the Shop-4 ledger shows **150,000**; the
   DP-25 ledger shows **240,000**; both are included in net profit.
3. Withdraw 500,000 from the bank, pay a 30,000 repair from cash and deposit 470,000 back.
   Expected: the bank balance is down 30,000 net; the cash book shows 3 lines ending at its
   prior balance; the repair expense is 30,000.
4. A buyer pays 1,000,000 token money and the sale completes later.
   Expected: the advance is applied at sale, the receivable equals the remaining balance,
   and the status goes UNDER_AGREEMENT → SOLD.
5. Edit a posted rent voucher from 50,000 to 55,000.
   Expected: a reversal and a new voucher exist, the ledger shows 55,000 net, and the audit log has the entry.
6. User A (Org 1) queries vouchers of Org 2 through the API. Expected: zero rows. Inserts are rejected.
7. After any sequence of the above, the trial balance total debits equal total credits.

## 10. Roadmap after v1

- **v1.1:** monthly rent accrual and arrears, document attachments, CSV import from registers, period lock.
- **v2 (SaaS):** self-serve sign-up polish, plans and billing, partner/co-ownership
  profit sharing, WhatsApp rent reminders.

## Approval

- [x] Product owner approves the spec → proceed to Stage 3 (build per `plan.md`)
