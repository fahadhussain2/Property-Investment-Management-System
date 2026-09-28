# Plan 002 — Dashboard v2

> Stage 3 artifact. Implements [`spec.md`](spec.md). Each milestone is one PR on its own branch
> and ends with a **verification gate** that the `verifier` subagent must pass before asking for
> human review.
> Status: **DONE**, 2026-09-28 · D1 ✅ merged (PR #10) · D2 ✅ merged (PR #11: 175 pgTAP, 10/10 evals, 76 unit, e2e 24/25; the one failure is the pre-existing flaky lease-lifecycle test, 1 in 6 on main) · D3 ✅ (in PR #11)

## Milestones

### D1 — Data: `monthly_performance()` (branch `feat/dashboard-data`)

Database only. There is no UI change, so it can merge on its own.

- Migration `supabase/migrations/20261002000001_dashboard.sql` (new file; merged migrations
  are append-only):
  - `public.monthly_performance(p_org uuid, p_months int default 12, p_as_of date default null)`
    per spec §4.1. `language plpgsql stable security definer`, `set search_path = public, pg_temp`.
  - Month series from `date_trunc('month', coalesce(p_as_of, org_today(p_org)))` back
    `p_months − 1` months (`generate_series`), left-joined to one grouped pass over
    `journal_lines` ⨝ `accounts`. The income and expense classification is copied from
    `income_statement` (subtypes `sales`, `cogs`, `rent`, other income; `total_expenses`
    excludes `cogs`). `closing_cash` is a running sum of cash and bank lines up to each
    `month_end`, including everything before the first month.
  - Security definer + one `is_member(p_org)` check instead of per-row RLS (spec §4.1, changed in D1 for speed).
  - `p_months` outside 1–24 → `raise exception` (written as plpgsql or a checked CTE; the
    choice is left to the PR).
  - `revoke execute … from public, anon` and `grant execute … to authenticated` (it is security definer).
- `npm run db:types` → `web/src/lib/database.types.ts`.
- pgTAP `supabase/tests/10_dashboard.sql`: spec §6 cases 1–6 (monthly = income statement per
  column; Σ FY = FY net profit; closing cash = account balances; empty month zeros and row
  count; bad `p_months` raises; org time zone decides the current month; cross-org zero rows).
- Eval: extend `evals/run.mjs` with a `monthly_performance` expectation
  (`{ "as_of": "…", "months": N, "rows": { "2026-03": { "net_profit": "…" } } }`) and add
  `evals/cases/10-dashboard-monthly-performance.json` (spec §6). Update `evals/README.md`.
- **Gate:** `npm run db:test` (all existing + new), `npm run evals` 10/10, `npm run check`
  (types regenerated and CI not stale). Performance check: `explain analyze` on the seed org
  plus 10k generated vouchers < 200 ms. Record the number in the PR.

### D2 — UI: new dashboard (branch `feat/dashboard-v2`, after D1 merges)

- **Dependencies:** `npx shadcn add chart` (adds `recharts` and `components/ui/chart.tsx`).
  No other new packages.
- **Theme tokens** in `web/src/index.css`: `--chart-income`, `--chart-expense`,
  `--chart-profit`, `--chart-status-rented|vacant|agreement`, with light and dark values from
  the reference palette (slots 1–3). Check both modes with the dataviz palette validator and
  paste its output in the PR. The shadcn default `--chart-1…5` greys are not used anywhere, so they are replaced with the
  palette's slots 1–5; `chart.tsx` expects them to exist.
- **`features/dashboard/`**:
  - `model.ts` (pure): `toChartRows` (decimal strings kept for display, `Number()` only in
    `*_y` geometry fields), `axisFor(rows)` (nice max/min, ticks, includes negatives),
    `compactMoney` (tick labels), `attentionLists(rentRoll, expiring, parties)` (filter,
    sort, top 5, counts, default tab), `portfolioSegments(summaries)` (exclusive statuses +
    for-sale flag + sold), `headline(balances, …)` sums via `lib/money`.
  - `model.test.ts`: the spec §6 unit list.
  - `api.ts`: `fetchMonthlyPerformance`, `dashboardKeys` under `['reports', orgId, …]` so
    `invalidateAfterPosting()` already refreshes them. Rent roll and party balances reuse
    the existing fetchers and keys.
  - `PerformanceChart.tsx` (default export, loaded with `React.lazy`): Recharts
    `ComposedChart` (two `Bar`s + `Line`), `ChartTooltip` with full formatted amounts, the
    "Show as table" toggle (a table that also prints), the empty state, and the `?range=` param.
  - `HeadlineTiles.tsx`, `NeedsAttention.tsx` (accessible tabs), `PortfolioCard.tsx`,
    `ProfitMix.tsx`, `CashAccounts.tsx`, `OwedCard.tsx`, `LatestEntries.tsx`.
  - `DashboardPage.tsx`: layout (spec §2) and queries. Each block has its own loading
    skeleton and `SectionError`. The cash-balance query no longer gates the whole page.
- **Test ids kept:** `total-cash`, `balance-<code>`, `profit-fy` (FY tile), `profit-month`
  (month sub-line), `owed-to-us`, `we-owe`, `portfolio-<filter>` (count buttons, including
  `portfolio-sold`), `recent-entries`, `expiring-leases` (Leases ending tab list).
  New: `rent-overdue`, `needs-attention`, `performance-chart`, `performance-table`.
- **Known e2e impact:** `leases.spec.ts:132–134` expects the expiring list to be visible on
  the dashboard. With tabs, a new lease that already has rent due opens the "Rent overdue"
  tab first. Update that test to click the "Leases ending" tab first. This is the only
  intended change to an existing test's steps. No expected values change.
  *As built:* `auth-and-members.spec.ts` (balances fail to load) also changed: each block that
  uses balances now shows its own error, so it takes `.first()` and additionally checks that
  `owed-to-us` is absent and that `profit-fy` (not balance-based) still loads.
- **New e2e** `web/e2e/dashboard.spec.ts`: spec §6 e2e list (FY tile = income statement
  page, chart table view values, rent overdue tile + tab + row link, portfolio filters, range
  toggle survives reload, 375 px no horizontal scroll in light and dark).
- **Gate:** `npm run check`, `npm run db:test`, `npm run evals`, `npm run e2e` all green.
  Screenshots at 375 / 768 / 1280 px, light and dark, attached to the PR. Bundle report:
  the dashboard chunk and the main chunk size before and after (the main chunk must not grow
  by more than 5 kB gzip).

### D2 as built (deviations, recorded for review)

- No "+ New entry" button in the page header (spec §3.9): the app shell already shows
  "New entry" on every screen size (sidebar button; "+" in the phone bottom bar), so it would
  be a duplicate.
- The small blocks share `Cards.tsx` instead of one file each; `parts.tsx` holds the shared
  block, skeleton and bar pieces; the sparkline is `Sparkline.tsx`; the lazy Recharts piece is
  `PerformanceChart.tsx` and its card (range, table view, empty state) is `PerformanceCard.tsx`.
- `lib/money.ts` gained `toChartNumber` and `sharePct`, the only places money becomes a number
  (geometry only).
- Portfolio counts are an auto-fill grid (columns of at least 11rem) rather than a fixed 2-column
  list (spec §3.4), so labels never truncate in a narrow card. The cash sparkline is hidden below
  640 px so the tile's amount has room. Needs attention tabs show short labels (Overdue, Ending,
  To pay) with count badges; their accessible names are the full ones.
- Headline tiles are boxes with a stretched link (not a link around everything), so a block's
  "Try again" retries in place (found in verifier review; covered in `auth-and-members.spec.ts`).
- Bundle: main chunk 94.28 → 94.94 kB gzip (+0.66 kB). The lazy chart chunk is 105 kB gzip
  (Recharts 3 bundles Redux Toolkit and d3 modules), twice the ~50 kB estimated below.

### D3 — Docs and close-out (in the D2 PR, not a separate PR)

- Spec 001 §6.1: add "Superseded by [spec 002](../002-dashboard-v2/spec.md)". This is a
  docs edit, so it is allowed; spec files are not append-only like migrations.
- CLAUDE.md: one line under Naming: "Charts: shadcn `chart` (Recharts), lazy-loaded; colours
  from `--chart-*` tokens; money → `Number()` only for geometry, never for displayed figures."
- Update this plan's status line with the final test counts.

## Risks and decisions

| Risk | Mitigation |
|---|---|
| The chart's sums drift from the income statement if the classification changes later | The pgTAP test compares every column to `income_statement`, so a drift fails CI |
| Recharts bundle weight (estimated ~50 kB gzip; measured 105 kB) | Lazy-loaded after the page renders; only the dashboard pays for it. A hand-drawn SVG chart (~3 kB) is the fallback if this matters |
| Time-zone edge at month boundaries | `org_today` + the pgTAP time-zone case; e2e uses the org date (as in the flaky-test fix f62e114) |
| Sale months spike and flatten the other bars | Accepted in intent (question 5). The tooltip and table view give exact values |
| Recharts renders SVG in pixels, so it can overflow on phones | `ChartContainer` is responsive; the 375 px overflow check runs after the chart has rendered |
| e2e flakiness from new sign-ups | Each test keeps unique users (CLAUDE.md) |

## Working method

Same as plan 001: each milestone starts in plan mode with the file list for approval; the
`verifier` subagent runs the gate before the PR; `accounting-integrity` and
`tenant-isolation` skills apply to D1; `REVIEW.md` drives the PR review.

## Approval

- [x] Engineer / product owner approves this plan → start D1
