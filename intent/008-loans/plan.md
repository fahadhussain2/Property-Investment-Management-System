# Plan 008 — Loans

> Stage 3 artifact. Implements [`spec.md`](spec.md). Each milestone is one PR on its own branch and ends
> with a **verification gate** that the `verifier` subagent must pass before asking for human review.
> Status: **DRAFT**, awaiting approval by Fahad Hussain · 2026-11-21

**Standing rule for both milestones (spec §1):** no existing test file, eval case or e2e spec may be edited
to make it pass. New tests go in new files or new cases. If an existing test fails, stop and report it to
the product owner with the output.

## L1 — Data, posting rules and isolation proof (branch `feat/loans-data`)

Database only, plus generated types and friendly error messages. Can merge on its own: no screen reads the new
objects yet, so behaviour is exactly as before.

### Migrations (new files, rule 9; the enum values each get their own file)

1. `20261122000001_lender_role.sql`: widen the `parties.roles` check to include `lender` (drop and re-add the
   constraint from `20260925000001_core_schema.sql:72`, same list plus `'lender'`).
2. `20261122000002_loan_received_type.sql`: `alter type voucher_type add value 'loan_received'`.
3. `20261122000003_loan_repayment_type.sql`: `alter type voucher_type add value 'loan_repayment'`.
4. `20261122000004_loans.sql`:
   - `post_voucher` (`create or replace`, whole body copied from `20261003000003_holdings_posting.sql:146`, as the
     earlier migrations did): numbering prefixes `LNR` / `LNP`, and two `when` branches V15 and V16 next to
     capital/drawing (spec §4). Both take `party_id`, `amount`, `account_id` (`_money_account`), tag the 2300 line
     with the lender, and refuse a party without the role `lender` ("Choose a lender.").
   - **Repayment cap with a friendly message** inside V16: owed = Σ(credit − debit) on 2300 for that party; refuse
     when the amount is more ("You owe <lender> only Rs …").
   - **Backstop trigger** `loans_not_negative`: a deferred constraint trigger on `journal_lines` (insert) for lines on
     the `loans` account with a `party_id`; at commit, a lender whose Σ(credit − debit) is below zero raises the
     "already been repaid" message of spec §4. Because it watches the lines, it also guards void
     (`reverse_voucher`), edit (`edit_voucher`) and a manual journal, without copying those functions. It is the
     rule that scenario 5 tests.
   - `preview_voucher` needs no change if it posts and rolls back (it did for holdings: verify; if it has its own
     type list, add the two types).
   - `loan_balances(p_org)` and `loan_ledger(p_org, p_party)` (spec §5): `security invoker`, `stable`, computed from
     `journal_lines` on the `loans` account only, voided/reversed lines included in the ledger and netting to zero
     in the balances; plus the "not assigned to a lender" amount. Granted to `authenticated`, not `anon`.
   - `party_balances` and `party_ledger` are not touched.
5. `npm run db:types`; `friendlyError` messages in `web/src/features/entries/forms.ts` for the three new errors.

### Tests (new files only)

- `supabase/tests/16_loans.sql` (pgTAP): exact lines for V15 and V16 and trial balance zero (spec scenario 1, 2);
  income statement unchanged before and after (1, 2); full repayment gives owed 0 (3); repayment above owed is
  refused (4); void of a repayment raises owed, void or downward edit of a part-repaid loan is refused (5); manual
  journal on 2300 without a lender appears as "not assigned" and the total equals the account balance (6); wrong
  role, other organization's party, future date, zero and 3-decimal amounts refused (7); a member of another
  organization sees nothing from `loan_balances` or `loan_ledger`, a viewer cannot post, `anon` cannot call (8);
  two lenders stay separate (9); the new role is accepted by `parties` and the old roles still are.
- `evals/cases/18-loans-do-not-touch-profit.json` (+ `evals/run.mjs` only if a step type is missing): borrow,
  repay in two parts, void one; assert cash, the lender balance and an unchanged income statement.
- `npm run db:test`, `npm run evals`, `npm run check` and `npm run e2e` must stay green with **no existing file edited**.

### Gate L1 (verifier)

Migrations apply from scratch (`db:reset`); `db:types` produces no diff; db:test, evals, check and e2e pass; the
file diff shows no edit to an existing test, eval or e2e spec; no new table, so no new RLS is needed, but the two
functions are proven isolated by tests above.

## L2 — Screens (branch `feat/loans-ui`, after L1 merges)

### Code

- `web/src/features/loans/`: `model.ts` (pure: `toLoanRow`, `toLoanLine`, settled/open split; no `lib/supabase`
  import), `api.ts` (queries under `['loans', orgId]`, invalidated by `invalidateAfterPosting()` because loans move
  cash), `LoansPage.tsx`, `LenderPage.tsx`, `schema.ts` if a form is needed, `model.test.ts`.
- `/loans` and `/loans/:id` routes; **Loans** in the desktop sidebar after Registers and on the mobile More page.
- Party role list: "Lender" in `lib/labels.ts` and `parties/schema.ts`.
- `/new`: two entries in `features/entries/types.ts`, group `money`: "Receive a loan" (`loan_received`, fields
  date, lender picker `roles: ['lender']` with `allowCreate`, amount, into, memo) and "Repaid a loan"
  (`loan_repayment`, from instead of into). Previews come from `preview_voucher`. Labels for the two types in the
  voucher/entries lists (`lib/labels.ts`, `entryState` untouched).
- Statement: table from `lg` and on print, stacked list on phones (as in the register ledger); voided lines stay,
  greyed and crossed out via `CANCELLED_AMOUNT`; each line links to its entry. Print header like the party statement.
- `SectionError` on a failed load, never Rs 0; `grid-cols-1` everywhere; dates through `formatDate`.
- `CLAUDE.md`: the short **Loans** rule (spec §7).

### Tests (new files only)

- Unit: `model.test.ts` (settled vs open split, owed from strings, no JS number arithmetic on money).
- e2e `web/e2e/loans.spec.ts`: spec scenarios 10 to 13 (record a loan and a part repayment from `/new`, `/loans`
  and the lender page figures, Cash by account moves while profit does not, void keeps the line visible, 375 px
  without sideways scroll in light and dark, the statement prints). Unique users per test (CLAUDE.md note).

### Gate L2 (verifier)

`npm run check`, `db:test`, `evals` and `npm run e2e` green; no existing test edited; works at 375 px; dashboard and
income statement figures unchanged by loans in the e2e proof.

## Risks and how the plan covers them

| Risk | Cover |
|---|---|
| Copying the whole `post_voucher` body can drop a branch | Diff the new body against the previous migration (only V15/V16 and the prefixes differ); the full existing pgTAP and eval suites run unedited as the proof |
| `alter type … add value` cannot be used in the same transaction | Two separate migration files for the enum values (CLAUDE.md naming rule) |
| Void or edit of a part-repaid loan silently makes a lender's balance negative | The deferred `loans_not_negative` trigger guards every path, tested in scenario 5 |
| A repayment dated before the loan | Allowed by design (spec decision 2); the cap is on the total owed, not by date |
| Loans change cash, so cached dashboard figures go stale | Entries invalidate through `invalidateAfterPosting()`; e2e scenario 11 checks Cash by account |
| Manual journal on 2300 hides debt from the lender list | "Not assigned to a lender" row, so the total always equals the account balance (scenario 6) |
| `party_balances` change would break existing tests | Not touched; loans have their own functions |

## Approval

- [ ] Product owner approves this plan → start L1
