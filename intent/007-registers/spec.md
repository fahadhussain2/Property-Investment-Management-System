# Spec 007 — Registers: memo ledgers outside the books

> Stage 2 artifact. Derived from [`intent.md`](intent.md). Adds a new area; changes nothing in specs 001–006.
> Status: **APPROVED** by Fahad Hussain, 2026-10-18 · **DONE** 2026-10-18 (plan 007 R1–R2)
>
> Amendment 1 (product owner, 2026-10-21): on screen the ledger shows the **newest entry first**, with the opening
> balance at the bottom ("Newest first" above the list). Print and CSV keep the register's own order: opening balance, then
> oldest first. Only the order changes; each line keeps its running balance from `register_ledger()`. Where §6 says
> "oldest first like the paper register", read it as applying to print and CSV.

## 1. Design principle: "a register is a paper ledger, not a second set of books"

A register is a list of dated lines, each money in or money out, with a running balance. It lives in its own
tables. It never writes to, reads from or joins `vouchers`, `journal_lines` or `accounts`, so no report can change.

| Requirement (intent) | How it falls out |
|---|---|
| Any number of registers (1) | `registers` table, many per organization |
| Date, description, in or out (2) | `register_entries`: `entry_date`, `description`, `direction`, `amount` |
| Running balance and totals (3) | Calculated by `register_ledger()` and `registers_overview` (rule 5: never stored) |
| Corrections keep history (4) | An entry is never edited or deleted. Void or correct sets `voided_*` and (for a correction) `replaced_by_id`; the old row stays |
| Print and CSV (5) | Print-only layout and `toCsv`, as on the party statement |
| Isolated (6) | No foreign key or function touches the books; proven by tests (§8) |
| Own page only (7) | Menu item and two routes; no dashboard code is touched |

**Safety requirement.** Every existing pgTAP test, eval case, unit test and e2e test must pass **without being
edited**. If one needs editing, that is a finding to report to the product owner, not a fix.

## 2. Glossary additions

| Term | Meaning |
|---|---|
| **Register** | A named memo ledger ("Zakat Fund"). Not part of the books. |
| **Register entry** | One line of a register. Money **in** raises the balance, money **out** lowers it. |
| **Opening balance** | The balance the register starts from, shown as its first line. |

A register entry is not a voucher and has no number.

## 3. Data model

```
registers(
  id uuid pk default gen_random_uuid(), org_id uuid not null → organizations on delete cascade,
  name text not null,                    -- trimmed, 1–60 characters
  opening_balance numeric(18,2) not null default 0,
  opening_date date,                     -- shown beside the opening balance; does not affect ordering
  is_active boolean not null default true,   -- false = archived
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id)
)
unique index on (org_id, lower(btrim(name)))

register_entries(
  id uuid pk default gen_random_uuid(), org_id uuid not null,
  register_id uuid not null,
  seq bigint generated always as identity,   -- order of entry within a date
  entry_date date not null,
  description text not null,             -- trimmed, 1–200 characters
  direction text not null check (direction in ('in', 'out')),
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  replaced_by_id uuid,                   -- set on the original of a correction
  foreign key (org_id, register_id) references registers (org_id, id) on delete restrict,
  foreign key (org_id, replaced_by_id) references register_entries (org_id, id),
  unique (org_id, id)
)
index on (org_id, register_id, entry_date, seq)
```

- Nothing references `accounts`, `vouchers`, `journal_lines`, `properties`, `parties` or `documents`, and nothing
  references a register except its entries.
- Entry state is derived (rule 7): live = `voided_at is null`; **Corrected** = voided with `replaced_by_id`;
  **Voided** = voided without one.
- The register's currency is the organization's currency. The opening balance may be negative (an overdrawn register).

### 3.1 Immutability
A `before update` trigger on `register_entries` allows only one change: from live to voided, setting `voided_at`,
`voided_by`, `void_reason` and (for a correction) `replaced_by_id`, once. Every other change is refused, and so is any
delete, except when the organization itself is being deleted (the same pattern as the other immutable tables).

### 3.2 Security (rule 3; skill `tenant-isolation`)
- Both tables have `org_id` and RLS. `select`: `is_member(org_id)`.
- `registers`: insert, update and delete by `has_role(org_id, '{owner,accountant}')` (a register with entries cannot be
  deleted: the foreign key refuses it; archive instead).
- `register_entries`: **no** insert, update or delete policy for `authenticated`. Writes go only through the three
  functions below.
- The functions are `security definer`, `set search_path = public, pg_temp`, take the organization **from the register
  row** (never from a parameter), call `require_role(org, '{owner,accountant}')` first, and are executable by
  `authenticated` only (not `anon`).

## 4. Writing entries

All three refuse an archived register ("This register is archived. Restore it to add entries.").

| Function | Does |
|---|---|
| `add_register_entry(p_register, p_date, p_description, p_direction, p_amount)` | Inserts a live entry; returns its id |
| `correct_register_entry(p_entry, p_date, p_description, p_direction, p_amount, p_reason)` | In one transaction: locks the entry (`for update`), inserts the corrected entry, and voids the original with `replaced_by_id` set to it |
| `void_register_entry(p_entry, p_reason)` | Voids a live entry with no replacement |

Rules (errors use `errcode 22023`, like the other RPCs):
1. `p_amount` is more than 0 and has at most 2 decimals; the description is 1–200 characters after trimming; the
   direction is `in` or `out`.
2. The date may not be after `org_today(org)` ("A register entry cannot be dated in the future.", rule 8). Past dates
   are allowed, so the paper register can be entered later.
3. A voided entry cannot be corrected or voided again ("This entry is already voided.").
4. The reason is optional (trimmed; empty is stored as null).

## 5. Derived state (rule 5: nothing stored)

- `register_ledger(p_register uuid)` (`security invoker`, so RLS applies): every entry of the register, voided ones
  included, ordered by `entry_date, seq`, with `running_balance` = opening balance + Σ(live `in`) − Σ(live `out`) up to
  that row. A voided row carries the balance as it was, without itself.
- `registers_overview` (`security_invoker = true`): per register `id, org_id, name, opening_balance, opening_date,
  is_active, total_in, total_out, balance, entry_count` (live entries) and `last_entry_date`.
- Backdating an entry changes the running balance of the later lines; that is intended.

## 6. Screens

| Where | What |
|---|---|
| Menu | New **Registers** item (desktop sidebar after Documents, and on the mobile More page) |
| `/registers` | One `<h1>`. A list of registers: name, balance now, total in, total out, last entry date; archived ones under "Archived". Empty state: "No registers yet. A register is a ledger kept outside your books, for example a Zakat fund." Action (when `canWrite`): **Add register** |
| Register dialog (`FormDialog`) | Name (required, 1–60), Opening balance (optional, default 0), As of (optional date). Duplicate name → "You already have a register with that name." Used for add and for rename / edit opening; **Archive / Restore** and **Delete** (only an empty register; otherwise the action explains why) on the register page |
| `/registers/:id` | `PageHeader` with the register name and the line "Not part of your books". Three figures: **Money in**, **Money out**, **Balance now**. Actions: Add entry (when `canWrite`), Print, CSV. The ledger below |
| Ledger | Desktop: a table, oldest first like the paper register: Date, Description, In, Out, Balance. First line "Opening balance" (with its date). Phones: a stacked list with the same fields. Voided rows stay in place, greyed out and crossed out, with the **Corrected** or **Voided** label and a red line through the amount (as in entry lists), and, under the description, "Voided dd/mm/yyyy by <member>: <reason>" and, for a correction, a link to the new line. The corrected line shows "Correction of …". Live rows have **Correct** and **Void** (when `canWrite`) |
| Entry dialog (`FormDialog`) | Date (default today), Description, In / Out choice, Amount. Correct opens it filled in and adds a Reason. Void asks for an optional Reason |
| Print | `window.print()`. A print-only header (business name, register name, "All entries · Printed dd/mm/yyyy, h:mm am"); the app chrome and buttons are `print:hidden`; the ledger prints in full |
| CSV | Date (ISO), Description, In, Out, Balance, Status (Live / Corrected / Voided), Reason. Voided rows included. Through `toCsv` |

- A failed load shows `SectionError`, never a balance of 0.
- Money is formatted from decimal strings; dates through `formatDate`; every grid is `grid-cols-1`; no sideways scroll at 375 px.
- A viewer sees everything and none of the write actions.
- Registers never appear on the dashboard, in Needs attention, in reports, or in the global entries list.

## 7. Migrations (append-only, rule 9)

1. `registers` and `register_entries` with indexes, RLS, grants, the immutability trigger, `add_register_entry`,
   `correct_register_entry`, `void_register_entry`, `register_ledger`, `registers_overview`.
2. `npm run db:types`.

Additive only: no existing table, function or row is touched. Database backups include the new tables with no
change to the scripts. `CLAUDE.md` gets a short **Registers** rule (memo ledger outside the books; never join them to
vouchers or journal lines; writes only through the three functions).

## 8. Acceptance scenarios (these become pgTAP, evals and e2e)

Isolation (the point of the feature):
1. Adding, correcting and voiding register entries leaves **unchanged**: the number of rows and the sums in
   `vouchers` and `journal_lines`, `account_balances`, `income_statement`, `balance_sheet`, `trial_balance`,
   `monthly_performance`, and every figure on the dashboard.
2. Posting a voucher (rent, expense, sale) leaves every register and its balance unchanged.
3. No foreign key from the two new tables to a books table, and none back (checked in pgTAP from the catalog).

Ledger:
4. Opening balance 53,650; in 1,000,000; out 23,500: running balances 53,650 → 1,053,650 → 1,030,150, and the
   register's balance, total in and total out agree (Σ lines = overview).
5. A back-dated entry changes the running balance of the later lines, not the earlier ones.
6. Correcting an entry: the original stays, voided, with `replaced_by_id`; the balance counts only the new one; the
   original's balance carries the value without itself. Voiding: the balance drops it, the row stays.
7. A voided entry cannot be voided or corrected again; a voided row's fields cannot be changed or deleted (trigger).
8. Future dates, zero or negative amounts, 3 decimals, an empty or 201-character description, a direction other than
   in/out are refused with the messages above.
9. An archived register refuses new entries; restoring allows them. An empty register can be deleted; one with
   entries cannot.

Access:
10. A member of another organization can select nothing and call nothing (select, the three functions, the views),
    for each of the two tables; `anon` cannot call the functions.
11. A viewer can read registers and ledgers but every write is refused by the database, and the UI hides the actions.
12. An accountant can add, correct and void; only owner or accountant can create or rename a register.

UI (e2e):
13. Create "Zakat Fund" with an opening balance, add an in and an out, see the running balances and the three
    figures; reload and see the same.
14. Correct and void entries: both stay visible with their labels and the red line; the balance is right.
15. Dashboard figures, Cash by account and the income statement are identical before and after the above.
16. Print view shows the print header and hides the chrome; the CSV button downloads the ledger.
17. `/registers` and a register page have no sideways scroll at 375 px, in light and dark.
18. Registers do not appear on the dashboard.

## 9. Out of scope (intent 007)

Categories or tags; links to cash, bank, parties, properties or documents; the Zakat ÷ 40 calculation; a dashboard
card; importing the paper register; attachments; per-entry numbers; filters and search inside a register (a possible
later addition if a register grows long).

## Approval

- [x] Product owner approves this spec → proceed to `plan.md`
