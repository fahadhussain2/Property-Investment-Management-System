# Intent 005 — Dashboard look and feel

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **APPROVED** by Fahad Hussain, 2026-10-02 (open-question defaults accepted)
> Owner: Fahad Hussain · Date: 2026-10-02

## Problem

Dashboard v2 (intent 002) shows the right figures in the right order, but the figure tiles at the top
do not look as good as they could:

- The tiles are plain boxes with a label and a number. They work, but they do not look sleek or modern,
  and nothing tells one tile apart from another at a glance.
- There are 8 tiles of the same size (4 key figures and 4 "What we own"). They take a lot of space,
  especially on a phone, where they fill four rows before the chart. Every number looks equally
  important, so the page feels heavy.
- The page appears all at once with no movement, so it feels flat when it loads.

## Desired outcome

A dashboard that looks sleek, modern and calm, without becoming colourful or busy:

1. **An icon on every tile.** Each tile shows a small icon at the top left, inside a softly tinted rounded
   square, next to the tile's label. The tile itself stays neutral (white in light mode, dark in dark mode)
   with its thin outline. Colour lives only in the icon square.
2. **Restrained colour.** At most 3–4 colours across the whole page. Colour is used where it means
   something: rent overdue is red, gold is amber, silver is grey. Rent overdue, when there is some, stays
   the only tile with a coloured outline, so it still stands out.
3. **Two levels of importance.** The 4 key figures (cash and bank, net profit, total invested, rent
   overdue) stay full size. The 4 "What we own" figures (properties, vehicles, gold, silver) become one
   compact card split into 4 sections, because together they make up Total invested. Each section still
   opens its own page.
4. **Less space.** The "What we own" row becomes clearly shorter on desktop, and on a phone the tiles no
   longer fill four rows of cards before the chart.
5. **Light, quick animation when the page loads:**
   - Each card fades in and rises slightly (a few pixels) when its figures arrive, one shortly after
     another. The whole sequence takes well under a second.
   - The monthly chart's bars grow up once when the chart first appears (not when switching 6/12 months).
   - The portfolio and profit-mix bars fill from the left.
   - Hovering a tile or link changes its background smoothly.
   - When figures are already loaded (coming back to the dashboard), cards just appear, with no replay.

## Users

Same as intent 001: the owner and staff now, subscribing property businesses later.
Viewers see the same dashboard without write actions.

## Constraints

- **Figures are never animated.** Amounts never count up or change while showing: a passing figure such
  as Rs 2,317,004 on the way to Rs 4,250,000 would be wrong for a set of books.
- **No heavy movement.** No sliding in from the side, bouncing, scaling or spinning.
- **Reduce motion.** Users who turn on "reduce motion" in their phone or computer settings see no
  animation at all.
- **Printing** always shows the finished page, never a half-faded card.
- **Light and dark themes.** Icon colours must read well in both.
- **Mobile.** Usable at 375 px width with no sideways scrolling.
- **Fast and free.** No new paid service or heavy library; the page should not get slower to open.
- **Same figures.** This is a change of look only. Every figure, link and the meaning of each tile stay
  as they are in intent 002.

## Out of scope (for now)

- New figures or new tiles
- Changing the blocks below the tiles (chart, needs attention, portfolio, cash by account, who owes whom,
  latest entries), apart from the load animation (see open question 2)
- Rearrangeable or hideable tiles
- A new colour theme for the rest of the app

## Decisions (agreed 2026-10-02)

1. **Icon in a tinted square on a neutral tile** ("option C"). Rejected: a coloured background on each
   tile (too colourful with 8 tiles, weak in dark mode, hides the rent overdue warning) and a coloured
   stripe on the left edge (looks dated, clashes with rounded corners).
2. **Key figures full size; "What we own" as one compact card in 4 sections.** Rejected: shrinking all
   8 tiles equally (small numbers in boxes look like a spreadsheet; long amounts wrap on phones).
3. **Minimal load animation** as in Desired outcome 5. Rejected: numbers counting up, and replaying the
   animation every time the dashboard is opened.

## Open questions (default assumption in brackets)

1. Which tiles get a coloured icon square? [Cash and bank blue, net profit green, gold amber, rent
   overdue red only when there is rent overdue; all others neutral grey.]
2. Should the blocks below the tiles (Needs attention, Portfolio, Cash by account, …) also get a small
   icon next to their title, to match? [Yes, small grey icons, no coloured squares.]
3. Should tiles lift slightly (a soft shadow) on hover? [No, only a subtle background change.]

## Approval

- [x] Product owner approves this intent → proceed to `spec.md` review
