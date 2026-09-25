# REVIEW.md — PR review policy

Every PR is reviewed in the passes below. Tag each finding **Important** (must fix
before merge) or **Nit** (optional). The author agent may not approve its own PR.
A human merges.

## Pass 1 — Accounting correctness (Important)
- Does every new or changed posting path produce balanced entries, and are the right accounts debited and credited per spec §5?
- Is money computed with decimal types only (no JS floats, no `real`/`float` in SQL)?
- Are property/party tags set on lines that need them (rent → property, payables/receivables → party)?
- Do reports still reconcile to the trial balance? Is there an eval or pgTAP test proving it?
- Are posted vouchers still immutable (edits go through reversal)?

## Pass 2 — Tenant isolation & security (Important)
- Every new table has `org_id`, RLS enabled and policies for select, insert, update and delete.
- `security definer` functions check membership and role explicitly and set `search_path`.
- No service-role key in `web/`. No secrets committed.
- A cross-org test exists for any new data path.

## Pass 3 — Spec & plan compliance
- The change matches the active `spec.md` / `plan.md`. Scope creep is flagged.
- The milestone gate in `plan.md` is satisfied and test output is attached.

## Pass 4 — Simplicity & UX (usually Nit)
- Could a non-accountant use this form? Plain-language labels, no debit/credit jargon in entry forms.
- Works at 375 px width. Loading, empty and error states exist.
- No new dependency without a reason stated in the PR.
