# Spec 008 — Loans

> Stage 2 artifact. Derived from [`intent.md`](intent.md). Extends spec 001 (§4 chart of accounts, §5 posting map).
> Status: **APPROVED** by Fahad Hussain, 2026-11-21

## 1. Design principle: "use the loan account that already exists"

Every business already has account **2300 Loans Payable** (liability, system key `loans`). Nothing posts to it
today. This feature adds two entry types that do, tagged with the lender, and a screen that reads the balance
per lender. No new table is needed: a lender is a party, and what is owed is computed from `journal_lines`
(rules 5 and 7).

**Safety requirement.** Every existing pgTAP test, eval case, unit test and e2e test must pass **without being
edited**. If one needs editing, that is a finding to report to the product owner, not a fix.

## 2. Glossary additions

| Term | Meaning |
|---|---|
| **Lender** | A party with the new role `lender`: a person who lent the business money. Not a "tenant" and not an organization. |
| **Loan received** | Money a lender gave the business. |
| **Loan repayment** | Money the business paid back to a lender. |
| **Owed** | Σ received − Σ repaid for one lender, from live journal lines on 2300. |

## 3. Data

- `parties.roles` accepts `lender` (the allowed list in the check constraint is widened; migration, rule 9).
  UI: the party role list gets "Lender" (`lib/labels.ts`, `parties/schema.ts`).
- `voucher_type` gets `loan_received` and `loan_repayment`, each in **its own migration file** (enum rule).
  Numbering prefixes: `LNR`, `LNP`.
- No table, no stored balance, no new column on journal lines. The lender is the `party_id` already on the line.

## 4. Posting map (added to spec 001 §5)

| # | Type | Fields | Debit | Credit |
|---|---|---|---|---|
| V15 | **Loan received** | `party_id` (lender), `amount`, `account_id` (cash/bank), `date`, `memo` | cash/bank `X` | Loans Payable (party = lender) |
| V16 | **Loan repayment** | `party_id` (lender), `amount`, `account_id` (cash/bank), `date`, `memo` | Loans Payable (party = lender) | cash/bank `X` |

Rules (errors use `errcode 22023`, like the other types):
1. The lender is required, must belong to the same organization and must have the role `lender`
   ("Choose a lender.").
2. The amount is more than 0 with at most 2 decimals. The date may not be in the future (`org_today`, rule 8).
3. **A repayment cannot exceed what is owed to that lender** ("You owe <lender> only Rs 40,000.").
   Voiding or editing a loan received is refused when it would leave a lender with a negative balance
   ("<lender> has already been repaid Rs 60,000 of this loan. Void or edit the repayments first.").
4. Profit and loss are never touched: neither entry has an income or expense line.
5. Void and edit are the existing `reverse_voucher` / `edit_voucher`; posted vouchers stay immutable (rule 6).
6. Viewers cannot post (the DB enforces it, as for every voucher).

## 5. Derived state (security invoker, so RLS applies)

- `loan_balances(p_org)`: per lender `party_id, name, borrowed, repaid, owed, last_date`. Lenders with no entries
  yet are listed with zeros.
- `loan_ledger(p_org, p_party)`: every line on 2300 for that lender, oldest first, with voucher number and type,
  debit, credit and a running balance owed.
- **Unassigned:** a manual journal entry may touch 2300 without a lender. `loan_balances` also returns that
  amount as "Not assigned to a lender", so the screen's total always equals the account balance.
- `party_balances` and `party_ledger` are **not changed** (their four accounts stay as they are), so existing
  tests and the party report are unaffected. Loans have their own screen.

## 6. Screens

| Where | What |
|---|---|
| Menu | New **Loans** item (desktop sidebar after Registers, and on the mobile More page) |
| `/loans` | One `<h1>`. A total "Owed now" figure, then a list of lenders: name, borrowed, repaid, owed, last entry date. A lender with a zero balance is shown under "Settled". Empty state: "No loans yet. When someone lends the business money, record it here." Actions (when `canWrite`): **Loan received**, **Loan repayment** |
| `/loans/:id` | `PageHeader` with the lender name. Three figures: Borrowed, Repaid, Owed now. A statement (table from lg, stacked list on phones, prints) with a running balance and a link to each entry. Voided entries stay visible as elsewhere |
| `/new` | Two entries in the "Money in & out" group: **Receive a loan** and **Repaid a loan**. The lender picker offers "+ New" and shows lenders first (roles: `lender`) |
| Preview | From `preview_voucher` (DB dry run), like every other form; no posting rules in the UI (rule 10) |
| Entries list, voucher page | Show the two types with their names and the lender |
| Reports | Balance sheet shows Loans Payable under liabilities (already the case once it has a balance). Income statement unchanged. The party balances report is unchanged |
| Dashboard | Cash and bank tiles move with the money as they should. No new tile |

- A failed load shows `SectionError`, never "Rs 0" (naming rule). Money is formatted from decimal strings;
  dates through `formatDate`; every grid is `grid-cols-1`; no sideways scroll at 375 px.
- A viewer sees everything and none of the write actions.

## 7. Migrations (append-only, rule 9)

1. Widen the party roles check to include `lender`.
2. `loan_received` in `voucher_type`. 3. `loan_repayment` in `voucher_type` (separate files).
4. Posting: V15 and V16 in `post_voucher` / `preview_voucher`, numbering prefixes, the repayment cap, the reversal
   guard, `loan_balances`, `loan_ledger`, grants.
5. `npm run db:types`.

Additive only: existing vouchers, accounts and reports are untouched. `CLAUDE.md` gets a short **Loans** rule
(loans go through the two voucher types; owed is computed from account 2300 by lender; never an expense or income).

## 8. Acceptance scenarios (these become pgTAP, evals and e2e)

Books:
1. Loan received of 500,000 into Bank: debit Bank 500,000, credit Loans Payable 500,000 (party = lender); trial
   balance stays zero; **income statement identical before and after**; the balance sheet shows liabilities +500,000.
2. Repayment of 200,000: debit Loans Payable, credit Bank; owed = 300,000; income statement still unchanged.
3. Full repayment: owed 0; the lender appears under "Settled".
4. A repayment above what is owed is refused with the message in §4.
5. Voiding a repayment raises owed again; voiding a loan received that was already repaid in part is refused;
   editing a loan's amount down below what was repaid is refused.
6. A manual journal on 2300 with no lender shows as "Not assigned to a lender"; the screen total equals the account balance.

Rules and access:
7. A party without the role `lender`, a party of another organization, a future date, a zero or 3-decimal amount
   are refused.
8. A member of another organization sees no loans, ledgers or balances. A viewer reads but cannot post.
9. Two lenders keep separate balances; a repayment to one does not change the other.

UI (e2e):
10. Record a loan received and a repayment from `/new`; `/loans` shows borrowed, repaid and owed; the lender
    page shows the statement with running balance; reload gives the same.
11. Cash by account on the dashboard moves with both entries; profit does not.
12. `/loans` and a lender page have no sideways scroll at 375 px, in light and dark; the statement prints.
13. Voiding an entry keeps it visible with its label and updates the balance.

## 9. Out of scope (intent 008)

Interest or profit share; due dates, instalments and reminders; lending to others; write-offs; non-cash loans;
documents on loans; a dashboard tile.

## Approval

- [x] Product owner approves this spec → proceed to `plan.md`
