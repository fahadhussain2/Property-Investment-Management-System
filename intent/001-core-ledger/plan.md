# Plan 001 — Core property ledger

> Stage 3 artifact. Implements [`spec.md`](spec.md). Each milestone is one PR, and each
> ends with a **verification gate** that Claude must pass before asking for human review.
> Status: **APPROVED**, 2026-09-25 · M0 ✅ · M1 ✅ · M2 ✅ · M3 ✅ in review (73 pgTAP, 6/6 evals, 19 unit, 9 e2e) · next: M4

## Repository layout (target)

```
/
├── intent/001-core-ledger/{intent,spec,plan}.md
├── CLAUDE.md · REVIEW.md
├── .claude/{settings.json, hooks/, skills/, agents/}
├── .github/workflows/{ci.yml, evals.yml, deploy.yml, backup.yml, keepalive.yml}
├── supabase/
│   ├── migrations/          # SQL, append-only once merged
│   ├── seed.sql             # local demo org
│   └── tests/               # pgTAP tests (posting, RLS, reports)
├── evals/                   # acceptance scenarios from spec §9 (input + expected)
└── web/                     # React + Vite SPA
    └── src/{app, features/<feature>/, components/ui, lib/}
```

## Milestones

### M0 — Tooling & skeleton
- `git init`, `.gitignore`, private GitHub repo, and branch protection on `main`.
- `supabase init`; `web/` via Vite (React + TS); Tailwind + shadcn/ui; ESLint + Prettier; Vitest.
- CI: typecheck, lint, unit tests, `supabase test db`.
- **Gate:** `npm run check` and `supabase test db` pass on an empty project.

### M1 — Ledger core (database) ⭐ the most important milestone
- Migrations: organizations, memberships, accounts, parties, properties, leases, vouchers,
  journal_lines, voucher_sequences, audit_log. Every table has `org_id` and RLS.
- `create_organization()` seeds the chart of accounts (spec §4).
- `post_voucher(jsonb)` covers V1–V14, `reverse_voucher()` and `edit_voucher()`.
- Deferred balance trigger; property status transitions.
- Report RPCs: `account_balances`, `ledger`, `property_summary`, `income_statement`,
  `balance_sheet`, `trial_balance`.
- **Gate:** pgTAP tests for every voucher type; every scenario in `evals/` passes; the RLS
  cross-org test passes; the trial balance is zero after the whole suite.

### M2 — Auth & organization
- Email/password sign-in, sign-up that creates an organization, member invites, and roles.
- App shell: responsive nav (bottom tabs on mobile), org switcher.
- **Gate:** e2e smoke (Playwright) for sign-up → org created → dashboard.

### M3 — Properties & parties
- Property register with status filters, the property form, and parties CRUD.
- Settings: bank & cash accounts (`add_money_account`), chart of accounts (add/rename/deactivate).
- **Gate:** component tests; manual screenshot check at 375 px and 1280 px.

### M4 — Voucher entry
- The "+ New" action menu, one form per voucher type (zod-validated), a confirmation
  screen showing the resulting entry (and profit, for a sale), and edit/void.
- **Gate:** each form posts successfully against the local DB in e2e; eval scenarios 1–5 can be reproduced through the UI.

### M5 — Books & reports
- Dashboard; cash/bank books; property 360° page; party ledger; income statement;
  balance sheet; trial balance; property profitability; print and CSV export.
- **Gate:** report numbers equal the `evals/` expected values when fed through the UI.

### M6 — Leases & rent roll
- Lease CRUD, automatic RENTED/VACANT status, rent roll with months unpaid, and expiring leases.
- **Gate:** pgTAP tests plus e2e for the lease lifecycle.

### M7 — Go-live
- Supabase cloud project and Cloudflare Pages deploy (GitHub Actions).
- **Blocker: turn on "Confirm email" in the hosted Supabase Auth settings.** `accept_invitations()`
  relies on confirmed emails; with confirmations off, anyone signing up with an invited address joins.
  Configure Resend SMTP (free tier) so confirmation emails are not rate-limited.
- Nightly backup workflow; keep-alive workflow.
- Opening-balance wizard; enter the real register data as of the cut-over date.
- **Gate:** the owner confirms that opening cash, bank and property balances match the registers (UAT sign-off).

## Working method (per the playbook)

- Each milestone starts in **plan mode**. Claude proposes the file list and tests, and the engineer approves.
- Parallel sessions (worktrees) only for independent work after M1, e.g. M3 and M5 UI.
- The `verifier` subagent runs the gate before every PR, and `REVIEW.md` drives PR review.
- When a bug is found, its scenario is added to `evals/` first, then fixed.
  Hooks block editing expected outputs while fixing.
- When Claude makes the same mistake twice, the correction goes into `CLAUDE.md`.
