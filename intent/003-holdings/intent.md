# Intent 003 — Vehicles, gold and silver

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **DRAFT**, awaiting approval
> Owner: Fahad Hussain · Date: 2026-09-29 (discussed with the family owner the same morning)

## Problem

The system records properties, cash and bank. Our other assets aren't recorded anywhere:

- **Vehicles.** We own vehicles, but they are not properties. Putting a car under Properties would
  be wrong: Properties must hold only real estate.
- **Gold and silver.** We hold gold and silver, bought by weight in grams, kilograms or tola. We can't
  see how much we hold, what we paid for it, or what it is worth at today's rate.

So the books show only part of what the business owns.

## Desired outcome

1. **Three separate registers: Vehicles, Gold and Silver.** Each is its own menu item, kept apart
   from Properties.
2. **Vehicles have a full history.** Purchase, costs added (registration transfer, modifications),
   running expenses (fuel, repairs, token tax, insurance) and the sale, with the gain or loss on sale.
3. **Gold and silver are tracked by item and by weight.** Each piece (e.g. "Bridal set 22K" or
   "10 tola bar 24K") records its weight and purity. Weights can be entered and shown in grams,
   kilograms or tola. Part of an item can be sold by weight.
4. **Value at today's rate.** We enter the current gold and silver rate. The system shows what our
   gold and silver are worth at that rate next to what we paid for them.
5. **Everything stays in one set of books.** These assets appear on the balance sheet, and gains on
   sale appear in the income statement, like everything else.

## Users

Same as intent 001: the owner and staff now, subscribing businesses later. Viewers see these pages
read-only.

## Constraints

- **Same integrity rules as the rest of the system.** Every entry goes through `post_voucher()` and
  balances, and history is never edited silently.
- **Weights must be exact.** No rounding drift between grams, kilograms and tola.
- **Simple forms.** "Bought gold", "Sold a vehicle" and so on, with no accounting jargon.
- **Mobile.** Usable at 375 px width with no sideways scrolling.
- **Free infrastructure.** No paid rate feed. Rates are entered by hand.

## Out of scope (for now)

- Zakat calculation (nisab)
- Fetching gold and silver rates automatically
- Vehicle depreciation
- Renting out vehicles
- Posting market-value changes into the books (revaluation)

## Decisions (agreed 2026-09-29)

1. Books stay at **cost**. Market value at the latest rate is shown alongside, as information. Profit is
   recorded only when something is sold.
2. Gold and silver are recorded as **separate items**, each with its purity. An item can be sold whole or in part.
3. Vehicles: buy, add costs, sell, and **running expenses tagged per vehicle**.
4. Gold and silver are **held as savings**. A gain or loss on sale is shown under other income, not as a
   trading section like property trading.

## Approval

- [ ] Product owner approves this intent → proceed to `spec.md` review
