---
name: accounting-integrity
description: Rules for any change touching vouchers, journal lines, accounts, money, or financial reports. Use when writing or reviewing posting logic, SQL report functions, or money handling in the UI.
---

# Accounting integrity

1. **Posting map is the spec.** `intent/001-core-ledger/spec.md` §5 defines the debit and credit for each voucher type. Implement it exactly. If a new case is not covered, stop and add it to the spec first.
2. **Balance check:** each voucher's Σdebit = Σcredit (deferred trigger). Each line has exactly one of debit or credit > 0.
3. **Sale profit:** the cost `C` = the property's full balance on account 1200 at posting time, computed inside `post_voucher` in the same transaction (costs cannot be posted to a sold property). Never let the client send `C`.
4. **Sign conventions in reports:** assets and expenses are debit-positive; liabilities, equity and income are credit-positive. Cost of Properties Sold appears as a deduction under Property trading.
5. **Money:** SQL `numeric(18,2)`; TS decimal strings through `lib/money.ts`. Round only at input (2 dp).
6. **Immutability:** never `update`/`delete` on `vouchers`/`journal_lines` after posting. Use `reverse_voucher`/`edit_voucher`, which write `audit_log`.
7. **Proof:** every posting change needs a pgTAP test that asserts the exact lines, plus the trial balance staying zero. If behavior visible to the business changes, add an eval case.
