# CLAUDE.md — Property Investment & Management System

Multi-tenant property ledger: buy, sell and rent properties, with full double-entry books behind simple forms.
Source of truth for scope: `intent/*/spec.md`. Read the active spec before coding.

## Stack
- `web/`: React + TypeScript + Vite, Tailwind, shadcn/ui, TanStack Query, React Router, zod.
- `supabase/`: Postgres migrations, RLS, plpgsql RPCs, pgTAP tests. No custom backend server.
- Hosting: Cloudflare Pages (frontend) and Supabase (DB/Auth/Storage). Must stay on free tiers.

## Commands (repo root unless noted; Docker Desktop must be running)
- `npm run db:start` / `npm run db:reset`: local Supabase / rebuild DB from migrations
- `npm run db:test`: pgTAP tests (integrity, tenant isolation)
- `npm run evals`: acceptance scenarios in `evals/cases` (runs as real users, RLS on, rolled back)
- `npm run db:types`: regenerate `web/src/lib/database.types.ts` after any migration (CI fails if stale)
- `cd web && npm run dev`: frontend on :5173 (reads URL/key from `supabase status`; no .env needed)
- `cd web && npm run check`: typecheck + lint + unit tests · `cd web && npm run e2e`: Playwright
- db:test, evals, check and e2e must all pass before saying "done".

## Windows note
The folder path contains `&`, which breaks npm's `.cmd` shims. A local, git-ignored `.npmrc`
sets `script-shell` to Git Bash, and `web/scripts/with-local-supabase.mjs` runs local bins through
`node` directly. Never spawn `.cmd` shims from scripts. Recreate the `.npmrc` on a new machine:
`npm config set script-shell "C:\Program Files\Git\bin\bash.exe" --location=project` (in root and `web/`).

## Non-negotiable rules
1. **All money moves through `post_voucher()`.** The UI never inserts into `journal_lines` or `vouchers` directly.
2. **Every voucher balances.** Σdebit = Σcredit, enforced by a deferred trigger. Never disable it.
3. **Every table has `org_id` and an RLS policy.** A new table without RLS is a bug. Add a cross-org pgTAP test.
4. **Money is `numeric(18,2)` in SQL and a decimal string in TS.** Never JS `number` arithmetic on money; use the `lib/money.ts` helpers.
5. **Balances are computed from `journal_lines`.** Do not add stored balance columns.
6. **Posted vouchers are immutable.** Edit = reverse + repost (`edit_voucher`). Void = reverse.
7. **Status is derived, not stored.** Use `property_status()`/`properties_overview`; never add a status column.
8. **Merged migrations are append-only.** Write a new migration; never edit an old one.
9. Business logic lives in SQL functions; the React side is forms and display only.

## Naming
- "Organization" (`org_id`) = SaaS customer. "Tenant" = a renter (a `party` with role `tenant`). Never mix these up.
- Voucher types: `purchase, property_cost, pay_seller, buyer_advance, sale, receive_buyer, rent, deposit, expense, income, transfer, capital, drawing, opening, journal`.
- Frontend features: `web/src/features/<feature>/` with `api.ts` (queries), pages, `schema.ts` (zod).
  Pure logic goes in files that do not import `lib/supabase` (so unit tests need no env).
- API `numeric` values arrive as JSON numbers: convert with `toMoney()` immediately.
- Current org/role: `useOrg()` (`canWrite` hides write actions for viewers; the DB enforces it anyway).
- Never render a fallback number (e.g. Rs 0) for data that failed to load: use `SectionError`.
- Grids: always `grid-cols-1` (or `minmax(0,…)` tracks). A bare `grid` or `1fr` track grows to its longest
  unbroken row and makes phones scroll sideways. e2e overflow checks use `expectNoHorizontalScroll`
  (compares with `clientWidth`) after real content has loaded.
- Every page has one `<h1>` (`PageHeader`/`AuthLayout`); e2e tests find pages by heading.

## Definition of done
Spec requirement met · pgTAP and unit tests added · `npm run check` + `supabase test db` + evals green · works at 375 px width.
