# Intent 002 — Dashboard v2

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **APPROVED** by Fahad Hussain, 2026-09-28 (open-question defaults accepted)
> Owner: Fahad Hussain · Date: 2026-09-28
> Mockup (sample data): https://claude.ai/artifact/WQR1s4kmhodarHyHAJz8qD

## Problem

The dashboard (spec 001 §6.1) shows the right numbers, but:

- It "looks pretty simple and unorganized". Six sections of equal weight are stacked top to
  bottom, so nothing tells the owner where to look first.
- It only shows today's figures. We cannot see whether the business is doing better or worse
  than in earlier months without opening reports.
- It does not show what needs action. Rent overdue is already calculated for the rent roll,
  but the dashboard does not show it, so unpaid rent is easy to miss.
- It uses space poorly. There is one card per bank account and six equal tiles for property
  counts.

## Desired outcome

A dashboard that looks professional, reads in a few seconds and works on a phone:

1. **Headline figures first.** Four key figures at the top: cash & bank, net profit this fiscal
   year (with this month underneath), money invested in properties held, and rent overdue.
2. **Trend over time.** A monthly chart of income, expenses and net profit for the last
   6 or 12 months, with each month's exact figures shown on hover or tap.
3. **Needs attention.** One panel listing rent overdue by tenant, leases ending soon, and
   balances we still owe sellers. Each row opens the matching record.
4. **Portfolio at a glance.** The mix of properties held (rented, vacant, for sale, under
   agreement) as one bar, plus how many have been sold. Each status opens the filtered
   property list.
5. **Where profit came from.** This year's profit split into profit on properties sold,
   rent, other income and expenses.
6. **Cash by account** as a compact list, plus who owes whom and the latest entries, as today.
7. Charts only where they add something (trends, comparisons). Figures the user must act on
   stay as numbers and lists. Every figure shown on a chart can also be read as text.

## Users

Same as intent 001: the owner and staff now, subscribing property businesses later.
Viewers see the same dashboard without write actions.

## Constraints

- **The numbers must agree with the reports.** The monthly chart must add up to the income
  statement for the same period, and headline figures must match the books and reports
  they link to.
- **Simple.** No accounting jargon on the dashboard.
- **Mobile.** Usable at 375 px width with no sideways scrolling.
- **Light and dark themes** (the theme toggle already exists).
- **Free infrastructure.** No paid chart or analytics service. Any chart library is bundled
  with the app and loads no external scripts.
- **Fast.** The dashboard should not become noticeably slower to open.

## Out of scope (for now)

- Custom or rearrangeable dashboard widgets
- Forecasts and budgets vs actuals
- Per-property charts (the property page is a separate piece of work)
- Comparison with the same period last year (see open question 2)

## Open questions (default assumption in brackets)

1. Are cash & bank, FY net profit, invested in properties held and rent overdue the right
   four headline figures? [Yes]
2. What should headline figures compare against? [No comparison in v2. Net profit shows
   this month under the fiscal-year figure. Year-on-year comparison needs a full year of data
   in most accounts, so it can come later.]
3. Should the "Needs attention" panel include rent overdue? [Yes, using the same calculation
   as the rent roll.]
4. Default chart range? [12 months on desktop, 6 on phone, switchable on desktop.]
5. Should profit on a sale be shown in the month the sale was recorded? [Yes. This makes
   sale months spike on the chart, which is true to the books.]

## Approval

- [x] Product owner approves this intent → proceed to `spec.md` review
