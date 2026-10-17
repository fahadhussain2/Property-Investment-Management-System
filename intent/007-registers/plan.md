# Plan 007 — Registers: memo ledgers outside the books

> Stage 3 artifact. Implements [`spec.md`](spec.md). Each milestone is one PR on its own branch and ends
> with a **verification gate** that the `verifier` subagent must pass before asking for human review.
> Status: **APPROVED** by Fahad Hussain, 2026-10-18 · R1 in progress

**Standing rule for both milestones (spec §1):** no existing test file, eval case or e2e spec may be edited
to make it pass. New tests go in new files or new cases. If an existing test fails, stop and report it to
the product owner with the output. Only new assertions may be *appended* to an existing file's plan where the
spec says so (none are needed here).

## R1 — Data, rules and isolation proof (branch `feat/registers-data`)

Database only, plus the generated types and the friendly error messages. Can merge on its own: nothing in the
app reads the new objects yet, so behaviour is exactly as before.

### Migration (new file, rule 9)

`supabase/migrations/20261008000001_registers.sql`:
- Table `registers` (spec §3): name check `btrim(name) <> '' and length(btrim(name)) <= 60`, `unique (org_id, id)`,
  unique index `(org_id, lower(btrim(name)))`, `org_id` FK to `organizations` `on delete cascade`.
- Table `register_entries` (spec §3): `seq bigint generated always as identity`, description check 1–200 after
  `btrim`, `direction in ('in','out')`, `amount > 0`, composite FKs `(org_id, register_id)` → `registers`
  (`on delete restrict` is checked at once and would block an organization's cascade delete, so use the default
  `no action`, as plan 006 learned for units) and `(org_id, replaced_by_id)` → `register_entries`; index
  `(org_id, register_id, entry_date, seq)`.
- RLS on both: `select` by `is_member(org_id)`. `registers`: insert, update (`name`, `opening_balance`,
  `opening_date`, `is_active`) and delete by `has_role(org_id, '{owner,accountant}')`; grants written out like
  `20260925000002_rls.sql` (column-level `update`; nothing to `anon`). `register_entries`: **only** `select` is
  granted and only a select policy exists.
- Trigger `register_entries_immutable` (spec §3.1): before update, allow only live → voided with
  `voided_at`, `voided_by`, `void_reason`, `replaced_by_id` written once; refuse every other change; before delete,
  refuse unless the organization no longer exists (the pattern in `20260927000001_account_management.sql`).
- `add_register_entry`, `correct_register_entry`, `void_register_entry` (spec §4): `security definer`,
  `set search_path = public, pg_temp`, organization read from the register row, `require_role` first, archived
  register refused, `for update` lock on the entry, date checked against `org_today(org)` (rule 8). `revoke` from
  `public, anon`; `grant execute` to `authenticated`.
- `register_ledger(p_register uuid)` (`language sql stable`, `security invoker`): all entries ordered by
  `entry_date, seq`, `running_balance = opening_balance + sum(case when voided_at is null then ±amount else 0 end)
  over (order by entry_date, seq)`; the opening balance is added in the function, not stored.
- View `registers_overview` (`security_invoker = true`, spec §5) with totals over live entries.
- `npm run db:types`.

### Friendly messages

- `web/src/lib/forms.ts`: map the new SQL messages (spec §4 and §6: future date, archived register, already voided,
  duplicate register name from the unique index, "This register has entries, so it can't be deleted.") to plain text.
  Unit tests in a new file.

### Tests

- pgTAP `supabase/tests/15_registers.sql` (new file; 14 is taken by `14_dashboard_cash_split.sql`):
  - spec §8.1–2: before/after snapshots of `vouchers` and `journal_lines` (row count and sums), `account_balances`,
    `income_statement`, `balance_sheet`, `trial_balance`, `monthly_performance` around adding, correcting and
    voiding entries; and a posted voucher leaves the register balance unchanged
  - spec §8.3: from `pg_constraint`, no foreign key between the two tables and any books table, either way
  - spec §8.4–6: exact running balances (53,650 → 1,053,650 → 1,030,150); back-dating; correct and void
    (original stays voided, `replaced_by_id` set, balance counts only the new line)
  - spec §8.7: voided entries cannot be voided or corrected again; the trigger refuses every other update and any
    delete
  - spec §8.8: each validation with its exact message (future date, zero and negative amount, 3 decimals, empty and
    201-character description, bad direction)
  - spec §8.9: archived register refuses entries and allows them after restore; delete of an empty register works,
    delete with entries is refused
  - spec §8.10–12 (rule 3, cross-org): a member of another organization cannot select from either table or the
    views, and cannot call the three functions or `register_ledger` on this organization's register; `anon` cannot
    call the functions; a viewer reads but every write is refused; an accountant can add, correct and void; the
    organization comes from the register, so a forged `org_id` has no parameter to ride on
- Evals (`evals/run.mjs` and `evals/README.md`): add `setup.registers: [{ key, name, opening }]` and a
  `register_entry` step (`add`, `correct`, `void`), and expectations `register: { key: { balance, total_in,
  total_out } }`. Existing cases untouched. New case `17-registers-outside-the-books.json`: a property bought, rent
  received and an expense paid, with register entries added, corrected and voided between them; the income
  statement, balance sheet and trial balance equal the values of the same case without any register step, the
  trial balance difference is 0, and the register balance is right (spec §8.1, §8.2, §8.4, §8.6).
- **Gate:** `npm run db:reset`, `npm run db:test` (all files, existing ones unedited), `npm run evals` (17/17),
  `npm run db:types` produces no diff, `cd web && npm run check`, `cd web && npm run e2e` (existing specs,
  unchanged, prove the app still works with the new schema).

## R2 — Screens (branch `feat/registers-ui`, after R1 merges)

- `web/src/features/registers/`:
  - `model.ts` (pure, no `lib/supabase`): `toRegisterRow` / `toLedgerRow` (numerics to `Money` immediately),
    `entryState` mapping to the existing `corrected` / `voided` states, `ledgerCsv`, the print line. `model.test.ts`.
  - `api.ts`: keys under `['registers', orgId]` and `['registers', orgId, registerId]`; fetch `registers_overview`
    and `register_ledger`; create / update / delete on `registers`; the three RPCs. Writes invalidate only the
    registers keys (never `reports`, `account-balances` or the dashboard, which spec §6 says do not change).
  - `schema.ts`: register (name 1–60 trimmed, opening balance optional decimal string, as-of optional date) and
    entry (date not in the future, description 1–200, direction, amount more than 0 with at most 2 decimals).
  - `RegistersPage.tsx` (`/registers`), `RegisterPage.tsx` (`/registers/:id`), `RegisterFormDialog.tsx`,
    `EntryFormDialog.tsx` (add, correct and void on `FormDialog`), `Ledger.tsx` (table on desktop, stacked list
    below `md`, voided rows with `EntryStateBadge` and `CANCELLED_AMOUNT` from `lib/entryState.ts`).
  - "Voided by" shows the member through the existing members listing; a member who has left shows "a former member".
- `web/src/app/router.tsx`: `registers` and `registers/:id`, inside the existing shell. `web/src/app/nav.ts`:
  Registers (`BookMarkedIcon`) in `sidebarNav` after Documents and in `moreNav`. Nothing under `features/dashboard`
  changes.
- Print: print-only header and `print:hidden` on the chrome and buttons, following `PartyStatement`; CSV through
  `toCsv`.
- e2e `web/e2e/registers.spec.ts` (new file; existing specs untouched), unique users per test:
  - spec §8.13: create "Zakat Fund" with an opening balance, add an in and an out, check the running balances and
    the three figures, reload
  - spec §8.14: correct and void; both stay with their labels and the red line; the balance is right
  - spec §8.15: dashboard "Cash" and "Bank" tiles, Cash by account and the income statement have the same figures
    before and after
  - spec §8.16: print view shows the header and hides the chrome; the CSV download has the ledger
  - spec §8.11: a viewer sees the ledger and no Add / Correct / Void / Add register
  - spec §8.17–18: `expectNoHorizontalScroll` at 375 px on `/registers` and a register page, light and dark; the
    dashboard has no register content
- Close-out: mark spec and plan **DONE**; `CLAUDE.md` gets the **Registers** rule (spec §7) and the glossary line
  ("Register" = memo ledger outside the books, never a voucher).
- **Gate:** `cd web && npm run check`, `cd web && npm run e2e` (new and existing specs), R1's gates still green,
  and a browser check at desktop and 375 px, light and dark, of both pages, the dialogs and the print preview.

## Risks and how the plan covers them

| Risk | Covered by |
|---|---|
| A register figure leaks into the books or a report | No foreign key either way (pgTAP catalog check); before/after snapshots in pgTAP and eval 17; dashboard e2e |
| A write path bypasses the history rule | No write policy on `register_entries`; the immutability trigger; pgTAP tries direct insert, update and delete as every role |
| Cross-organization access through the functions | Organization read from the register row; `require_role` first; pgTAP cross-org on every function and view |
| The running balance is wrong after a back-dated or voided entry | One window function in the database, never recomputed in the browser; pgTAP and eval figures |
| The UI invalidates the dashboard by accident | Register writes invalidate only `['registers', …]`; the dashboard e2e compares figures |
| Production deploy | Additive migration only, nothing existing is touched; pre-deploy backup as usual |

## Approval

- [x] Product owner approves this plan → proceed to build R1
