# Spec 003 — Vehicles, gold and silver ("holdings")

> Stage 2 artifact. Derived from [`intent.md`](intent.md). Extends spec 001 (§2, §4, §5, §6) and spec 002 (§3).
> Status: **APPROVED** by Fahad Hussain, 2026-09-29

## 1. Design principle: "a second register next to Properties"

Vehicles, gold and silver are **holdings**: assets the business owns that are not real estate. They
get their own register and their own tag on journal lines (`holding_id`), next to `property_id`.
Nothing about properties changes. The same rules apply: posting goes through `post_voucher()`,
balances (money **and** weight) are computed from `journal_lines`, status is derived, and posted
vouchers are immutable.

| Requirement | How it falls out |
|---|---|
| Vehicles separate from Properties | Separate `holdings` table and pages; Properties stays real estate only |
| Full history per vehicle / gold item | All journal lines tagged `holding_id` |
| Weight held | Σ `quantity_g` of journal lines tagged with the item (never stored) |
| Gain on sale | The sale voucher relieves cost and posts the difference to Gain on Sale of Assets |
| Value at today's rate | Weight held × latest rate × purity, shown next to cost (not posted) |

"Holding" is the word in code only. The UI says **Vehicles**, **Gold** and **Silver**.

## 2. Glossary additions

| Term | Meaning |
|---|---|
| **Holding** | A vehicle, a gold item or a silver item. Class: `vehicle`, `gold` or `silver`. Identified by a short code, e.g. `CAR-1`, `G-01`. |
| **Purity** | Fraction of pure metal in an item: 24K = 1.0000, 22K = 0.9167, 21K = 0.8750, 18K = 0.7500; silver 999 = 0.9990, 925 = 0.9250. Metals only. |
| **Metal rate** | The organization's rate for **one tola** of pure gold (24K) or pure silver on a date, entered by hand. |
| **Weight units** | gram (g), kilogram (kg) = 1,000 g, tola = 11.6638038 g. |

## 3. Holding records

`holdings(id, org_id, class, code, name, notes, created_at)` plus:

- **Vehicle fields** (all optional): make, model, year, registration no., chassis no., engine no., colour.
- **Metal field:** `purity` (required for gold and silver, not allowed for vehicles).
- `code` is unique per organization (case-insensitive), across all three classes.

Derived status (rule 7, no status column):

| Status | Vehicle | Gold / silver |
|---|---|---|
| `held` | no sale voucher | weight held > 0 and never sold |
| `partly_sold` | — | weight held > 0 and at least one sale |
| `sold` | a sale voucher exists | weight held = 0 after a sale |

A sold holding stays in history. Costs cannot be added to a sold holding, and a sold metal item cannot take more sales.

## 4. Chart of accounts additions

Seeded for new organizations **and** added to existing ones by the migration.

| Code | Account | Type | Subtype | `system_key` |
|---|---|---|---|---|
| 1400 | Vehicles at Cost | Asset | `holding` | `vehicles` |
| 1500 | Gold at Cost | Asset | `holding` | `gold` |
| 1510 | Silver at Cost | Asset | `holding` | `silver` |
| 4250 | Gain on Sale of Assets | Income | `asset_gain` | `asset_gain` |
| 6200 | Fuel | Expense | `vehicle_expense` | — |
| 6210 | Vehicle Repairs & Maintenance | Expense | `vehicle_expense` | — |
| 6220 | Token Tax & Insurance | Expense | `vehicle_expense` | — |

A loss on sale is a debit to 4250, so the account can show a negative income. Users can add further
vehicle expense categories (`add_category_account`, kind `vehicle_expense`).
None of these codes is in a range users can add accounts in, so they never clash with an existing
organization's accounts. (4250, not 4300 as first drafted: 4300–4899 is the range for user-added income
heads; changed at Stage 3, H1.) Users can add vehicle expense heads in 6230–6299.

## 5. Vouchers

New voucher types: `holding_purchase` (prefix **HPU**), `holding_cost` (**HCO**), `holding_sale` (**HSA**).
`[H]` = tagged with the holding, `qty` = grams on the line (positive in, negative out), `A(H)` = the
cost account of the holding's class (1400 / 1500 / 1510).

| # | Voucher | Form fields | Posting |
|---|---|---|---|
| H1 | **Bought a vehicle / gold / silver** | holding (new or existing, of that class), seller (optional), date, price `P`, paid now `A` from `X`, metals: weight + unit | Dr `A(H)` [H, +qty] `P` · Cr `X` `A` · Cr Payable to Sellers [H,Pty] `P−A`. A seller is required when `A < P`. A metal item can be bought more than once (adding weight). A vehicle can be bought once. |
| H2 | **Paid a cost on a vehicle / gold item** (registration transfer, making charges, modification) | holding (not sold), amount, from `X`, what for | Dr `A(H)` [H] · Cr `X`. Adds to cost, not to weight |
| H3 | **Sold a vehicle / gold / silver** | holding (not sold), buyer (optional), date, sale price `S`, received now `R` into `X`, metals: weight sold + unit, or "the whole item" | Cost relieved `C`: vehicle = full cost balance; metal = `cost × sold_g ÷ held_g` rounded to 2 dp, or the full cost balance when the whole item is sold. Dr `X` `R` · Dr Receivable from Buyers [H,Pty] `S−R` · Cr `A(H)` [H, −qty] `C` · Cr (gain) / Dr (loss) Gain on Sale of Assets [H] `S−C`. A buyer is required when `R < S`. Weight sold ≤ weight held. **Gain `S−C` is shown on confirmation.** |

Changes to existing vouchers:

- **Pay seller balance (V3) / Receive buyer balance (V6):** take a property **or** a holding (exactly one).
- **Expense (V9):** optional vehicle (`holding_id` of class `vehicle`) in addition to the optional property.
  The form always offers an optional vehicle picker (clarified at Stage 3, H2: simpler than showing it only for
  `vehicle_expense` heads, and a repair can be booked under any head).
- **Other income (V10):** 4250 is not a valid category (it is posted only by H3).
- **Opening balances (V13) / journal (V14):** each line may carry `holding_id`, and lines on 1500/1510
  carry the weight. This is how gold and vehicles already owned at go-live are entered.
- **Reversal / edit:** the reversal copies `holding_id` and negates `quantity_g`. The purchase or a cost
  of a sold holding cannot be reversed until its sale is reversed (as for properties).

Journal line rules (database-enforced):

- `quantity_g` is set only on lines of the gold or silver cost accounts, and those lines always have
  a `holding_id` and a `quantity_g` (0 for cost-only lines such as H2).
- `holding_id` on a class-specific account must match the class (a gold item can't be on 1400).
- Weight held per item never goes below zero.
- A line that moves weight must also move money (every journal line has a debit or a credit). So an item
  received at zero cost can't be recorded, and a sale whose share of cost rounds to 0.00 is rejected
  (clarified at Stage 3, H1).

## 6. Weights and rates

- Weights are stored in grams as `numeric(24,10)`, so any g, kg or tola entry with up to 3 decimals is
  stored exactly (tola = 11.6638038 g has 7 decimals). The UI accepts g, kg or tola and
  converts in SQL (`unit_to_grams`). Display: the item's chosen unit to 3 decimals, with grams underneath.
  In TypeScript weights are decimal strings (`lib/quantity.ts`), never JS numbers, as with money.
- "The whole item" on H3 sends no weight: the database sells exactly the weight held, so no rounding
  is left behind.
- `metal_rates(org_id, metal, rate_date, rate_per_tola)`: one rate per metal per day (a second entry the
  same day replaces it). A Rates dialog on the Gold and Silver pages lets owners and accountants enter
  today's rate. The date defaults to `org_today`.
- **Market value** of an item = `held_g ÷ 11.6638038 × rate_per_tola × purity`, rounded to 2 dp, using
  the latest rate on or before the as-of date. **Unrealized gain** = market value − cost balance.
  Neither is posted. If no rate exists, market value shows "No rate yet" (never Rs 0). A rate older than
  7 days shows "rate from <date>" in the warning style.

## 7. Screens

1. **Navigation:** Vehicles, Gold and Silver, after Properties.
2. **Vehicles register:** code, name, make/model/year, registration, status, cost (price + costs),
   running expenses, sale price, gain. Filter by status. "+ Add vehicle".
3. **Gold / Silver register:** header totals: weight held, cost, market value, unrealized gain, and the
   rate with its date and a "Set today's rate" button. Rows: code, name, purity, weight held, cost,
   market value, unrealized gain, status. A unit switch (g / tola / kg) is kept in the URL.
4. **Holding page (360°):** details and actions (add cost, sell, edit details); KPIs (cost, running
   expenses for vehicles, sale price, gain, and for metals weight held and market value); a timeline of
   every voucher for the holding.
5. **New entry:** a new group "Vehicles, gold & silver": *Bought a vehicle*, *Bought gold or silver*,
   *Paid a cost on a vehicle or gold item*, *Sold a vehicle*, *Sold gold or silver*. Previews come from
   `preview_voucher`.
6. **Opening balances:** rows for vehicles and gold/silver items (item, cost, weight).
7. **Reports:**
   - Income statement: "Gain on sale of assets" is shown under Commission & other income, broken down
     by Vehicles / Gold / Silver. "Vehicle expenses" is a new expense group between property and
     selling expenses.
   - Balance sheet: 1400–1510 appear as asset rows (no data change).
   - New **Holdings report** (`ReportShell`): all items at cost and at market value, by class, with totals,
     print and CSV. As of today (clarified at Stage 3, H2): valuing each item at a past date needs another SQL
     function; `holdings_valuation(org, as_of)` already gives past totals by class if that is wanted later.
8. **Dashboard (amends spec 002 §3):** a "Vehicles, gold & silver" card after Portfolio: vehicles at
   cost; gold and silver weight held, cost and market value; links to each register. It is hidden when
   the organization has no holdings. The four headline tiles don't change.

## 8. Data (new SQL)

- Migrations: an enum migration on its own (new voucher types), then schema + RLS, posting, reports.
  All append-only.
- Tables: `holdings`, `metal_rates`; columns `vouchers.holding_id`, `journal_lines.holding_id`,
  `journal_lines.quantity_g`. `holding_id` is added to the immutability guard. RLS on both new tables,
  as for `properties` (read by members; write by owner/accountant).
- `unit_to_grams(qty numeric, unit text) returns numeric` (immutable).
- `holdings_overview` view (`security_invoker`): per holding: cost balance, running expenses, weight
  held, status, sale price, realized gain, latest rate, market value, unrealized gain.
- `holding_breakdown(p_org, p_holding)`: like `property_breakdown`.
- `holdings_valuation(p_org, p_as_of date default null)`: per class totals at cost and at market as of
  a date (`org_today` by default). Used by the dashboard and the Holdings report.
- `income_statement` gains `asset_gains`, `asset_gains_by_class` and `vehicle_expenses`. `other_income`
  and `total_expenses` keep their meaning (they already include these accounts), so `monthly_performance`
  and the dashboard stay consistent without change.

## 9. Acceptance scenarios (these become `evals/`)

1. **Vehicle:** buy CAR-1 for 3,000,000 from Meezan, pay 50,000 registration transfer in cash, 20,000 fuel
   tagged CAR-1, sell for 3,200,000. Expected: cost relieved 3,050,000; gain 150,000; CAR-1 running
   expenses 20,000; CAR-1 status `sold`; 1400 balance 0.
2. **Gold partial sale:** buy G-01, 10 tola 22K, for 2,000,000; sell 3 tola for 720,000. Expected: cost
   relieved 600,000; gain 120,000; weight held 7 tola (81.6466266 g); cost balance 1,400,000; status `partly_sold`.
3. **Sell the rest:** then sell the whole of G-01 for 1,500,000. Expected: cost relieved 1,400,000 exactly;
   weight 0; status `sold`; 1500 balance 0.
4. **Valuation:** hold 10 tola 22K at cost 2,000,000; gold rate 250,000 per tola. Expected market value
   2,291,750.00 (10 × 250,000 × 0.9167); unrealized gain 291,750.00; balance sheet still shows 2,000,000.
5. **Units:** buying 1 kg of silver and 5 tola of silver on the same item gives 1,058.319019 g.
6. **Reversal:** reversing the partial sale in (2) restores 10 tola and a cost of 2,000,000.
7. **Isolation:** Org 2 cannot read or write Org 1's `holdings` or `metal_rates`.
8. After all of the above, the trial balance balances.

## 10. Roadmap

Zakat (nisab on gold/silver), automatic rate feed, vehicle depreciation, renting out vehicles and
revaluation entries are left for later versions.

## Approval

- [x] Product owner approves the spec → proceed to Stage 3 (build per `plan.md`)
