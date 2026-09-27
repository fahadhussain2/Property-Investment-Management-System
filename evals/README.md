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
