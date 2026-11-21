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
- Production: merge to main → CI → `deploy.yml` (backup, `supabase db push`, build, Cloudflare Pages). Nightly
  `backup.yml` and daily `keepalive.yml` (calls `public.ping()`). Setup and restore: `docs/go-live.md`.
  Nightly and pre-deploy backups are the database only; the weekly run (`BACKUP_FILES=1`, Sunday) adds documents'
  files (`scripts/backup-files.mjs`, needs the `SUPABASE_S3_*` secrets once documents exist). Files stay weekly to
  fit GitHub's 500 MB artifact storage. `scripts/restore-files.mjs` puts them back.
  Security headers/CSP live in `web/public/_headers`: a new external origin must be added there.
- e2e may read auth emails from Mailpit (`http://127.0.0.1:54324`); CI keeps Mailpit running for this.
- Local auth allows 1000 sign-ups/5 min (config.toml): each e2e run creates ~22 users, and the default 30
  likely caused intermittent sign-up failures on back-to-back runs. Keep e2e users unique per test.

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
   Weights (gold/silver) follow the same rule: grams `numeric(24,10)` in SQL, decimal strings in TS (`lib/quantity.ts`).
   Entries send the weight as typed plus its unit; SQL converts (`unit_to_grams`, 1 tola = 11.6638038 g).
5. **Balances are computed from `journal_lines`.** Do not add stored balance columns.
6. **Posted vouchers are immutable.** Edit = reverse + repost (`edit_voucher`). Void = reverse.
7. **Status is derived, not stored.** Use `property_status()`/`properties_overview` (and `holding_status()`/`holdings_overview`
   for vehicles, gold, silver); never add a status column. Weight held is Σ `journal_lines.quantity_g`, never stored.
8. **Business dates use the organization's calendar, never the DB clock.** The DB runs in UTC; Pakistan is
   UTC+5. Use `org_today(org)` (organizations.timezone) for "today"; never `current_date` in business logic.
9. **Merged migrations are append-only.** Write a new migration; never edit an old one.
10. Business logic lives in SQL functions; the React side is forms and display only.

## Naming
- "Organization" (`org_id`) = SaaS customer. "Tenant" = a renter (a `party` with role `tenant`). Never mix these up.
- Voucher types: `purchase, property_cost, pay_seller, buyer_advance, sale, receive_buyer, rent, deposit, expense, income, transfer, capital, drawing, opening, journal, holding_purchase, holding_cost, holding_sale`.
  A new enum value goes in its own migration file (it can't be used in the transaction that adds it).
- "Holding" (code only) = a vehicle, gold item or silver item (`holdings.class`); the UI says Vehicles / Gold / Silver.
  Journal lines carry `holding_id` next to `property_id`. Books stay at cost; market value (`metal_rates`) is display only.
- "Unit" (spec 006) = a part of a property rented on its own (`property_units`: a floor, flat or shop), never a
  weight unit. A lease is for one unit (`leases.unit_id`) or the whole property (null). Leases conflict only on the
  same unit, or when one is for the whole property (`check_lease`). Name a lease with `leaseLabel()`
  (`code · unit · tenant`). Rent entered without a lease counts towards ONE lease (`rent_roll`) and is refused when
  the tenant has two leases active that day (`vouchers_unlinked_rent`): a new query that reads leases must keep both.
  Books stay per property: units never reach `journal_lines`. Occupancy comes from `property_units_overview` /
  `properties_overview`, never stored.
- "Register" (spec 007) = a memo ledger kept outside the books (a Zakat fund): own tables `registers` / `register_entries`, never a
  voucher. Never join them to `vouchers`, `journal_lines` or `accounts`, and never refresh books, reports or dashboard queries
  when one changes (its keys are under `['registers', orgId]`). Entries are written only through `add_register_entry` /
  `correct_register_entry` / `void_register_entry` and are never edited or deleted: a correction or void marks the old line
  and keeps it. The running balance comes from `register_ledger()`, never stored or recomputed in the browser.
- "Loan" (spec 008) = money borrowed from a lender (a `party` with role `lender`) and repaid later, no interest. Only the two voucher types
  `loan_received` and `loan_repayment` move it (Dr/Cr account 2300 Loans Payable, tagged with the lender); never capital,
  income or an expense, so profit never changes. What is owed comes from `loan_balances()` / `loan_ledger()` (journal lines on
  2300 by lender), never stored. A lender can never be owed less than zero (`journal_lines_loan_not_negative`). Loans have
  their own pages (`/loans`); `party_balances` is deliberately unchanged. Loan data lives under `['loans', orgId]`.
- Frontend features: `web/src/features/<feature>/` with `api.ts` (queries), pages, `schema.ts` (zod).
  Pure logic goes in files that do not import `lib/supabase` (so unit tests need no env).
- API `numeric` values arrive as JSON numbers: convert with `toMoney()` (weights: `toGrams()`) immediately.
- Current org/role: `useOrg()` (`canWrite` hides write actions for viewers; the DB enforces it anyway).
- Never render a fallback number (e.g. Rs 0) for data that failed to load: use `SectionError`.
- Dates on screen are dd/mm/yyyy: `formatDate`/`formatDateTime` (`lib/dates.ts`), never `toLocaleDateString` or a raw
  ISO date. Data, URLs and CSV stay ISO. Date inputs are the browser's own and follow its language setting.
- Grids: always `grid-cols-1` (or `minmax(0,…)` tracks). A bare `grid` or `1fr` track grows to its longest
  unbroken row and makes phones scroll sideways. e2e overflow checks use `expectNoHorizontalScroll`
  (compares with `clientWidth`) after real content has loaded.
- Entry forms are config-driven (`features/entries/types.ts`); field names = `post_voucher` payload keys.
  Previews come from `preview_voucher` (DB dry run). Never re-implement posting rules in the UI.
- After saving, `navigate()` first, then `invalidateAfterPosting()`. And a page that redirects based on data
  it just changed (the edit page vs. a now-voided original) must read that data under its OWN query key,
  outside what the save invalidates: RR navigations are transitions, so the old page can still re-render and
  redirect after `navigate()` (this caused an intermittent e2e failure in M4/M5).
- Dialogs can open inside other forms: `FormDialog` stops submit propagation (React bubbles through portals).
- Reports use `ReportShell` (period/as-of kept in the URL, Print, CSV via `toCsv`, which neutralises formulas).
  Anything collapsible on screen must still print (see the income statement's rent breakdown).
- Charts: shadcn `chart` (Recharts), lazy-loaded so only the page using it pays for it; colours come from the
  `--chart-*` tokens in `index.css` (validated palette, light and dark). Money becomes a JS number only for
  geometry (`toChartNumber`/`sharePct` in `lib/money.ts`); every figure a user reads is formatted from the Money
  string. A chart needs a table view (accessible, and it is what prints).
- Motion (spec 005): `motion-safe:` only, `opacity`/`transform` only, short (≤ 0.5 s), and only when real content
  replaces a skeleton (`Loaded` provides `useAnimateIn()`; cached data just appears). Never animate a figure
  (no count-up). `@media print` turns animations and transitions off. Theme values that read a per-element
  variable (`--i` stagger) go in `@theme inline`, or they resolve on `:root`.
- Every page has one `<h1>` (`PageHeader`/`AuthLayout`); e2e tests find pages by heading.
- Documents (spec 004): files live in the private bucket `documents` at `<org>/<document>/<safe name>`; the
  `documents` table is written only through `add_document`/`update_document`/`delete_document`. Upload = Storage
  upload → `add_document` (remove the file if it fails); delete = `delete_document` → remove the file. Open files
  only through short-lived signed URLs, never stored or public. The bucket's size and type limits (migration and
  `config.toml`, kept in step) are the real control; UI checks only give friendly messages. Pure file logic is in
  `lib/files.ts`. A new record type that takes documents needs a link column, a composite FK and `documents_overview`.

## Definition of done
Spec requirement met · pgTAP and unit tests added · `npm run check` + `supabase test db` + evals green · works at 375 px width.
