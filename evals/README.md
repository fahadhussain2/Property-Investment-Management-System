# Evals — acceptance scenarios

Each file in `cases/` is one business scenario taken from spec §9: a list of vouchers
to post into a fresh organization, and the exact numbers the reports must return.
The runner (built in M1) creates a throwaway organization, posts each step through
`post_voucher()`, then compares the report RPCs with `expect`.

Rules:
- Cases are **frozen** once committed. The `guard-files` hook blocks edits; fix the code, not the expectation.
- Every production bug adds a new case before it is fixed.
- Amounts are strings (decimal), never JSON numbers.
- Accounts are referred to by seeded code (spec §4). `bank:Meezan` means the bank account named Meezan created in `setup`.
- `monthly_performance` checks the dashboard RPC: `{ "as_of", "months", "rows": { "YYYY-MM": { column: amount } },
  "totals": { column: sum over all months } }`. Always pin `as_of` so a case never depends on today's date.
- Holdings (spec 003): `setup.holdings` (`code`, `class`, `purity`), `setup.metal_rates` (`metal`, `date`,
  `rate_per_tola`); steps take `holding`, `weight`, `unit` (`g`/`kg`/`tola`) and `whole`. `holdings_overview`
  checks rows by code; `holdings_valuation` is `{ "as_of", "<class>": { column: value } }`. The overview values at
  the latest rate up to today, so give rates past dates.
- Documents (spec 004): step `{ "type": "attach", "document": key, "to": { "property"|"lease"|"party"|"holding"|"voucher": ref },
  "file", "size", "mime", "category", "title" }` stores a stub Storage object as the owner (RLS on) and calls `add_document`.
  `documents` checks `documents_overview` fields by key (values as strings; `voucher` is a step id); `storage_used` is bytes.
  An `edit` step with an `id` names the replacement entry.
- Units (spec 006): `setup.units` (`key`, `property`, `name`); a lease (in `setup.leases` or a `{ "type": "lease", … }` step,
  which adds it between entries) takes `unit` (a unit key; omit for the whole property). `rent_roll` rows are keyed by
  property code, or by `"lease:<key>"` when a property has several leases. Any entry step may carry `"error"`: it must
  fail with a message containing that text, and is rolled back.
- Registers (spec 007): `setup.registers` (`key`, `name`, `opening`); steps `{ "type": "register", "op": "add" | "correct" | "void",
  "register": key, "entry": step id of the line to correct or void, "date", "description", "direction": "in" | "out", "amount",
  "reason" }`, where a step `id` names the line it creates (a `correct` step's id names the replacement line). `register`
  checks `registers_overview` fields by register key plus `balances`, the running balance of every ledger line in order.
- Loans (spec 008): a party with `"roles": ["lender"]`; steps `loan_received` / `loan_repayment` take `party`, `amount`, `into` (received) or
  `from` (repayment). A `{ "type": "void", "voucher": step id, "reason" }` step reverses a posted entry.
