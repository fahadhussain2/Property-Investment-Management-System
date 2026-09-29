# Plan 003 — Vehicles, gold and silver

> Stage 3 artifact. Implements [`spec.md`](spec.md). Each milestone is one PR on its own branch and ends
> with a **verification gate** that the `verifier` subagent must pass before asking for human review.
> Status: **IN PROGRESS** · H1 ✅ merged (PR #16: 221 pgTAP, 13/13 evals) · H2 built 2026-09-29, awaiting review

## Milestones

### H1 — Data (branch `feat/holdings-data`)

Database only. Can merge on its own.

- `supabase/migrations/20261003000001_holdings_enum.sql`: `alter type public.voucher_type add value`
  `holding_purchase`, `holding_cost`, `holding_sale`. On its own file: a new enum value can't be used in
  the transaction that adds it.
- `20261003000002_holdings_schema.sql`:
  - `holdings` and `metal_rates` (spec §3, §6), `unique (org_id, id)`, case-insensitive code index,
    RLS policies modelled on `properties` in `20260925000002_rls.sql`.
  - `vouchers.holding_id`, `journal_lines.holding_id` (composite FKs `(org_id, holding_id)`, indexes),
    `journal_lines.quantity_g numeric(24,10)`.
  - New `guard_voucher_update` including `holding_id`.
  - Account subtype check replaced to add `holding`, `asset_gain`, `vehicle_expense`; `seed_chart_of_accounts`
    replaced with the spec §4 rows; backfill every existing org (next free code on a clash);
    `add_category_account` accepts `vehicle_expense`.
  - Journal line check trigger for the spec §5 line rules (quantity only on 1500/1510, class matches
    account, weight held ≥ 0 per holding at commit: deferred constraint trigger like `journal_lines_balanced`).
- `20261003000003_holdings_posting.sql` (base: `post_voucher` in `20260930000001_leases.sql`):
  - `_new_voucher` / `_line` overloads with `holding_id` and `quantity_g`; `_voucher_prefix` adds HPU/HCO/HSA;
    `_holding_sold(org, holding)`, `_holding_account(org, holding)`.
  - `post_voucher`: H1–H3; V3/V6 accept a holding; V9 optional vehicle; V10 rejects `asset_gain`;
    V13/V14 lines take `holding_id` and `quantity_g` (weight via `weight` + `unit` per line).
  - `reverse_voucher`: copies `holding_id`, negates `quantity_g`; blocks reversing the purchase/cost of a sold holding.
  - Check `edit_voucher`, `preview_voucher`, `voucher_detail` still work (they call the above) and
    `voucher_detail` returns holding code/name.
- `20261003000004_holdings_reports.sql`: `unit_to_grams`, `holdings_overview`, `holding_breakdown`,
  `holdings_valuation`, new `income_statement` fields (spec §8). Revoke/grant like existing RPCs.
- `npm run db:types`.
- pgTAP `supabase/tests/11_holdings.sql`: posting shapes for H1–H3; partial-sale relief and exact final
  relief; weight can't go negative; quantity/class line rules; reversal restores weight and cost; no
  costs/sales on a sold holding; V10 rejects 4250; income statement fields reconcile with
  `monthly_performance`; cross-org isolation on `holdings`, `metal_rates` and the new RPCs; seed and backfill
  create the new accounts once.
- Evals: `11-vehicle-buy-cost-sell.json`, `12-gold-partial-then-full-sale.json`, `13-metal-valuation-and-units.json`
  (spec §9); extend `evals/run.mjs` with `holdings_overview` / `holdings_valuation` expectations; update `evals/README.md`.
- **Gate:** `npm run db:test`, `npm run evals` 13/13, `npm run check` (types not stale).

### H2 — UI (branch `feat/holdings-ui`, after H1 merges)

- `web/src/lib/quantity.ts` + tests: weight decimal strings, `formatWeight(grams, unit)`, unit labels,
  parsing (≤ 3 decimals). No `number` arithmetic. Conversions for display only; posting sends weight + unit.
- `web/src/features/holdings/`: `api.ts` (keys under `['holdings', orgId, …]`, included in
  `invalidateAfterPosting()`), `schema.ts`, `HoldingsPage.tsx` (one component, routes `/vehicles`, `/gold`,
  `/silver`), `HoldingPage.tsx` (360°, pattern of `features/properties/PropertyPage.tsx`),
  `HoldingFormDialog.tsx` (vehicle vs metal fields, purity presets), `RateDialog.tsx`, pure `filter.ts` + test.
- Entries (`features/entries/types.ts`, `fields.tsx`, `payload.ts`): field kinds `holding` (with class filter
  and "+ New") and `weight` (amount + unit, or "the whole item" on sales); group "Vehicles, gold & silver";
  expense form shows the vehicle picker for `vehicle_expense` categories; V3/V6 forms accept a holding.
- `OpeningBalancesPage.tsx`: holding and weight columns.
- Reports: income statement rows (asset gains by class, vehicle expenses, still printable); new Holdings
  report on `ReportShell` with CSV.
- Dashboard: "Vehicles, gold & silver" card (spec §7.8), `SectionError` on failure, hidden when empty.
- Navigation, `lib/labels.ts` (voucher types, classes), `PageHeader` h1 on every new page.
- e2e `holdings.spec.ts`: create gold item → set rate → buy 10 tola → sell 3 tola → gain on confirmation and
  in the income statement; vehicle buy + fuel expense + sale; viewer sees no write actions;
  `expectNoHorizontalScroll` at 375 px on the three registers, the holding page and the new forms.
- **Gate:** `npm run check`, `npm run e2e`, plus H1's gates still green.

### H3 — Docs close-out

- Mark spec/plan DONE, update `CLAUDE.md` (voucher type list, "holding" naming, weights are decimal strings like money).
