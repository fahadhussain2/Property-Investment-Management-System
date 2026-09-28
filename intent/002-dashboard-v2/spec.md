# Spec 002 — Dashboard v2

> Stage 2 artifact. Derived from [`intent.md`](intent.md). Replaces spec 001 §6.1 (Dashboard).
> Status: **APPROVED** by Fahad Hussain, 2026-09-28
> Mockup (sample data): https://claude.ai/artifact/WQR1s4kmhodarHyHAJz8qD

## 1. Design principle: "one question per block"

Each block on the dashboard answers one question. A chart is used only when the answer is a
trend or a comparison. When the user has to act on the answer, it is shown as a list or a
number. Every figure comes from an existing report or a new SQL function over `journal_lines`,
so the dashboard never disagrees with the reports it links to.

| Block | Question it answers | Form |
|---|---|---|
| Headline figures | "How are we doing right now?" | 4 figure tiles |
| Income, expenses and profit | "Are we doing better or worse over time?" | Monthly bars + net-profit line |
| Needs attention | "What do I need to chase or pay?" | Tabbed list |
| Portfolio | "What is the state of what we own?" | One stacked bar + counts |
| Where this year's profit came from | "What made the money?" | Horizontal bars |
| Cash by account | "Where is the money?" | List with inline bars |
| Who owes whom | "What is owed, each way?" | Two figures |
| Latest entries | "What was recorded last?" | Table |

## 2. Layout

Desktop (≥ 1024 px), top to bottom:

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Cash & bank  │ Net profit FY│ Invested     │ Rent overdue │   row 1: 4 tiles
├──────────────┴──────────────┴──────┬───────┴──────────────┤
│ Income, expenses and profit (2/3)  │ Needs attention (1/3)│   row 2
├────────────────────┬───────────────┴──────┬───────────────┤
│ Portfolio          │ Where profit came    │ Cash by       │   row 3
│                    │ from                 │ account       │
├────────────────────┼──────────────────────┴───────────────┤
│ Who owes whom      │ Latest entries (2/3)                 │   row 4
└────────────────────┴──────────────────────────────────────┘
```

- Tablet (640–1023 px): tiles 2 × 2; rows 2–4 become one block per row, except row 3, which is
  2 columns + 1.
- Phone (< 640 px): tiles 2 × 2, then every block full width in this order: chart, needs
  attention, portfolio, profit mix, cash by account, who owes whom, latest entries (5 rows).
- All grids follow the CLAUDE.md rule (`grid-cols-1` or `minmax(0, …)` tracks). No
  horizontal scroll at 375 px.
- The page keeps one `<h1>` (organization name) and the description
  "Your business today · FY <label> · as of <org today>".

## 3. Blocks

All money is shown with `formatMoney` in the organization's currency. Negative amounts use
the existing negative style. A block whose data fails to load shows `SectionError` with Retry
in place of that block only. It never shows a zero. A block that is loading shows a skeleton
the size of the block, so the layout does not jump.

### 3.1 Headline figures

| Tile | Value | Sub-line | Links to |
|---|---|---|---|
| Cash & bank | Σ balance of accounts with subtype `cash` or `bank` | "N accounts" + 6-month sparkline of month-end cash (§4.1 `closing_cash`) | `/money` |
| Net profit · FY <label> | `income_statement(fy).net_profit` | "This month <net_profit of current month>" | `/reports/income-statement` (FY) |
| Invested in properties held | Σ cost of properties whose status is not `sold` (as today) | "N properties at cost" | `/properties` |
| Rent overdue | Σ `rent_roll.arrears` over rows with `arrears > 0` | "N tenants · M months unpaid" (M = Σ `months_unpaid`) | `/leases` (rent roll) |

- The **Rent overdue** tile uses the critical style (red border and a warning icon, never
  colour alone) only when the value is > 0. At zero it reads "No rent overdue" in the normal
  style.
- Rent overdue includes leases that have ended but still have arrears, because that rent is
  still owed. This matches the rent roll.
- The sparkline is decoration for the trend. It has no axis and is `aria-hidden`. The tile's
  text carries the value.

### 3.2 Income, expenses and profit (the main chart)

- **Data:** `monthly_performance(org, months)` (§4.1). A month is a calendar month in the
  organization's time zone. The last month is the current month to date.
- **Range:** 12 months by default on screens ≥ 640 px, 6 months on phones. A "6 months /
  12 months" toggle appears on ≥ 640 px screens. The range is kept in the URL (`?range=6`) so
  reloads keep it.
- **Marks:** per month, two bars side by side on one shared money axis:
  - **Income** = `total_income` (profit on properties sold + rent + other income; the same
    definition as the income statement's "Total income"). Blue, categorical slot 1.
  - **Expenses** = `total_expenses`. Orange, slot 2.
  - **Net profit** = `net_profit` as a 2 px line with 8 px dots. Aqua, slot 3.
  - One y-axis only (no dual axis). Zero is always the baseline. When any value in range is
    negative (for example a month where a property sold at a loss), the axis extends below zero.
  - Y-axis ticks use compact labels (0, 1M, 2M…; "K" below a million). Gridlines are
    hairlines. Month labels are short ("Sep"). A month that is January shows the year
    ("Jan 26").
- **Legend** above the plot: Income, Expenses, Net profit.
- **Hover (pointer) / tap (touch):** a tooltip for the month showing Income, Expenses and Net
  profit as full formatted amounts, plus the month name and year. The hit area is the whole
  month column, not only the bar.
- **Table view:** a "Show as table" control swaps the chart for a table with the same
  numbers (Month, Income, Expenses, Net profit). This is the accessible version and is also
  what prints.
- **Empty state:** when every month in range is zero, show "No income or expenses recorded in
  the last N months" with a link to New entry, not an empty chart.
- Link: "Income statement →" (current FY).

### 3.3 Needs attention

A card with three tabs. Each tab shows its row count, and the card header shows the total.
Each list shows at most 5 rows, sorted by the stated key, then a "View all" link.

| Tab | Source | Rows | Sort | Row content | Row links to | "View all" |
|---|---|---|---|---|---|---|
| Rent overdue | `rent_roll(org)` | `arrears > 0` | arrears desc | property code · tenant name / "N months unpaid · last paid <date>" (or "nothing received yet") / arrears amount | `/leases/<id>` | `/leases` |
| Leases ending | `expiring_leases(org)` (existing, 60 days) | all | days to end asc | property code · tenant / "Ends <date>" / "today", "in N days" | `/leases/<id>` | `/leases?show=ending` |
| To pay | `party_balances(org)` | `payable > 0` | payable desc | party name / "Balance owed on purchases" / payable amount | party ledger | `/reports/parties` |

- The first tab with any rows opens by default (in the order above).
- When all three are empty, the card shows "Nothing needs attention" with a check icon.
- Each tab is a real `tablist` / `tab` / `tabpanel` with keyboard support (arrow keys).

### 3.4 Portfolio

- **Correction to the mockup:** "For sale" is a flag, not a status. A rented property can
  also be listed for sale (spec 001 §3). So the stacked bar uses only the exclusive statuses
  of held properties: **Rented** (slot 1), **Vacant** (slot 2) and **Under agreement**
  (slot 3). Its segments add up to "N held".
- Below the bar: a 2-column list of buttons, one per segment, plus **Listed for sale**
  (count of held properties with the `for_sale` flag) and **Sold**. Each button shows its
  count and links to `/properties?status=<value>`, the same filters the register already uses.
- Header: "N held · M sold".
- The bar has `role="img"` and an `aria-label` that lists every count.
- Segment widths are proportional to counts, with a 2 px gap between segments. A zero count
  has no segment but still appears in the list.
- Empty state (no properties): "No properties yet" with a link to "Bought a property".
- Existing test ids (`portfolio-<filter>`) stay on the count buttons.

### 3.5 Where this year's profit came from

- **Data:** `income_statement(fy)`.
- Four rows, each a label, a formatted amount and a horizontal bar: **Profit on properties
  sold** (`gross_trading_profit`), **Rent** (`rent_income`), **Other income**
  (`other_income`), **Expenses** (`total_expenses`, shown in brackets).
- Bars share one scale (the largest absolute value is full width). Income rows are slot 1;
  Expenses is slot 2. A negative trading profit draws its bar in slot 2 and shows the amount
  as negative.
- Footer: **Net profit** (`net_profit`), which must equal the FY tile.

### 3.6 Cash by account

- One row per cash or bank account: name, "Bank" or "Cash", balance and a bar (share of the
  largest balance; a negative balance shows no bar and the negative style). Sorted by balance
  desc. Each row links to `/money/<account_id>`. Footer: Total (= the Cash & bank tile).
- The existing "Add your bank accounts" prompt moves here and shows when there is no bank
  account.
- Existing test ids (`total-cash`, `balance-<code>`) stay.

### 3.7 Who owes whom

Unchanged figures from today (`owed-to-us`, `we-owe` test ids stay). "You owe others" adds a
one-line breakdown: sellers · token money · deposits held.

### 3.8 Latest entries

A table (on phones, a list) of the 5 latest vouchers: date, entry type and number, property
code (or "—"), amount. It links to the voucher. Test id `recent-entries` stays. The empty
state is unchanged ("Nothing recorded yet. Start with opening balances.").

### 3.9 Actions

The page header gets a "+ New entry" button (hidden for viewers via `canWrite`). The theme
toggle stays where it is in the app shell. The mockup's button was only for previewing.

## 4. Data

### 4.1 New RPC: `monthly_performance(p_org uuid, p_months int default 12, p_as_of date default null)`

Returns one row per month, oldest first, for the `p_months` months ending with the month of
`coalesce(p_as_of, org_today(p_org))`. The app never passes `p_as_of`. It exists so tests and
evals can pin the date, like `rent_roll(p_org, p_as_of)` (clarification added at Stage 3).

| Column | Type | Meaning |
|---|---|---|
| `month_start` | date | First day of the month |
| `month_end` | date | Last day of the month, or the as-of date for the as-of month |
| `gross_trading_profit` | numeric(18,2) | Same definition as `income_statement` |
| `rent_income` | numeric(18,2) | 〃 |
| `other_income` | numeric(18,2) | 〃 |
| `total_income` | numeric(18,2) | 〃 |
| `total_expenses` | numeric(18,2) | 〃 |
| `net_profit` | numeric(18,2) | 〃 |
| `closing_cash` | numeric(18,2) | Σ balance of cash and bank accounts up to and including `month_end` |

Rules:
- Computed from `journal_lines` only. Uses the same account classification as
  `income_statement`, so for any month, each column equals `income_statement(org,
  month_start, month_end)`. The pgTAP test proves this (§6).
- `p_months` must be between 1 and 24. Anything else raises an error.
- Months with no activity return zeros, not a missing row.
- "Today" is `org_today(p_org)`, never `current_date` (CLAUDE.md rule 8).
- `stable`, `set search_path = public, pg_temp`. **Security definer** with an explicit
  membership check (changed at Stage 3, D1): under RLS, `journal_lines` calls `is_member()`
  once per row, which made this function take 175–275 ms for 10k vouchers against a 20 ms
  pass without RLS. `is_member(p_org)` is now checked once and every read is filtered by it
  and `p_org`. A caller who is not a member gets all-zero rows and the UTC date, exactly what
  RLS would give them.
- One pass over `journal_lines` grouped by month. It must not call `income_statement` 12
  times. Target: < 200 ms for 10k vouchers on the local stack.
- No new tables, so no new RLS policy is needed. The cross-org test still applies (§6).

### 4.2 Existing sources (unchanged)

`account_balances`, `income_statement` (FY and current month), `fetchPropertySummaries`,
`rent_roll`, `expiring_leases`, `party_balances`, `fetchEntries({ limit: 5 })`. Each block has
its own query, so one failure does not blank the page. The cash-balance query no longer gates
the whole page as it does today. It gates only the blocks that use it.

## 5. Frontend

- **Chart library:** Recharts through shadcn/ui's `chart` component (`ChartContainer`,
  `ChartTooltip`). Colours come from CSS variables: new `--chart-income`, `--chart-expense`,
  `--chart-profit` and `--chart-status-*` tokens in `index.css`, with light and dark values
  (reference palette, validated with the dataviz validator for both modes). It is bundled, so
  `_headers` / CSP do not change.
- **Bundle:** the chart code loads with `React.lazy` inside the dashboard. The block shows its
  skeleton until the chunk arrives. It adds no weight to other pages.
- **Money rule:** API values go through `toMoney()` as today. Only the chart's geometry uses
  `Number(money)` (bar heights, line points). Every figure a user reads (tooltip, table,
  tiles, list amounts) is formatted from the decimal string. No arithmetic on JS numbers.
- **Files** (`web/src/features/dashboard/`):
  - `DashboardPage.tsx`: layout and queries only.
  - `api.ts`: `fetchMonthlyPerformance`, query keys (under `reportKeys.all(org)` so
    `invalidateAfterPosting()` refreshes them).
  - `model.ts` (pure, no `lib/supabase` import): builds chart rows, axis max and ticks,
    compact tick labels, the attention lists (filter, sort, top 5), the portfolio segments, and
    the headline sums.
  - `PerformanceChart.tsx` (lazy), `NeedsAttention.tsx`, `PortfolioCard.tsx`,
    `ProfitMix.tsx`, `CashAccounts.tsx`: presentational pieces.
- `database.types.ts` is regenerated (`npm run db:types`).

## 6. Tests and acceptance

### pgTAP: `supabase/tests/10_dashboard.sql`
1. For a seeded org with activity over 3 months (a purchase, a sale at a profit, rent,
   expenses, other income), each row of `monthly_performance` equals `income_statement` for
   that month, column by column.
2. Σ `net_profit` over the months of the FY = `income_statement(fy).net_profit`.
3. `closing_cash` for the current month = Σ `account_balances` for cash and bank accounts.
4. A month with no activity returns zeros. The row count equals `p_months`. `p_months = 0`
   and `25` raise errors.
5. The current month follows `org_today`: with the org's time zone set so the org date is the
   1st of a month while UTC is still the previous day, the last row is the org's month.
6. Cross-org: a member of org A calling `monthly_performance(org B)` gets all-zero rows.

### Eval: `evals/cases/10-dashboard-monthly-performance.json`
Using the spec 001 scenario 1 and 2 entries spread over two months: the monthly rows show the
trading profit (2,300,000) in the sale month and the rent in its months, and their sum equals
the income statement for the period.

### Unit (`model.test.ts`)
Axis max and ticks (including negative months), compact labels, attention sorting and the
top-5 cut, portfolio segments adding up to "held" with for-sale counted separately, empty
states.

### e2e (`web/e2e/dashboard.spec.ts`)
- After recording a sale and rent: the FY tile equals the income statement page's net profit.
  The chart's table view lists the months with those amounts.
- Rent overdue: a lease with unpaid months shows in the tile and the Needs attention tab, and
  the row opens the lease.
- Portfolio buttons open the register with the matching filter.
- The range toggle switches 6 / 12 months and survives reload.
- 375 px: `expectNoHorizontalScroll` after content has loaded, in light and dark themes.
- Existing dashboard assertions in other specs keep passing (test ids are kept).

### Definition of done
Everything above passes, plus `npm run check`, `npm run db:test`, `npm run evals` and
`npm run e2e`. The page works at 375 px. Spec 001 §6.1 is marked "superseded by spec 002".

## 7. Out of scope

Rearrangeable widgets, forecasts and budgets, year-on-year comparison, per-property charts,
and exporting the dashboard itself (the reports it links to already print and export CSV).

## Approval

- [x] Product owner approves the spec → proceed to Stage 3 (`plan.md`)
