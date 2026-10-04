# Spec 005 — Dashboard look and feel

> Stage 2 artifact. Derived from [`intent.md`](intent.md). Changes how spec 002 §2, §3.1 and §3.1a look;
> every figure, sub-line, link and test id defined there stays the same.
> Status: **APPROVED** by Fahad Hussain, 2026-10-02
> Amendment 2 (product owner, 2026-10-02): Rent overdue > 0 no longer has the red ring. Its red top strip, red
> label and alert icon remain. Where this spec mentions the red ring below, read it as removed.
>
> Amendment 3 (product owner, 2026-10-04): the Cash & bank tile's sub-line is now its cash / bank split in short
> figures, "Cash 5.5 lakh · Bank 1.13 crore" (`formatCompact`: lakh/crore for PKR, K/M otherwise, at most 2
> decimals, exact below a lakh; a kind with no account is left out). It replaces "N accounts" and the 6-month
> sparkline (spec 002 §3.1), which did not leave room for it, so the tile keeps its height from tablet width up;
> on phones the split may take two lines. The total above stays exact, and Cash by account keeps exact figures.
> The short form is for this glance line only: every other figure stays in full digits.

## 1. Design principle: "colour in the icon, calm everywhere else"

Cards stay neutral (`bg-card`, the existing thin ring). Colour appears only in a small icon square, and
only where it means something. Movement is short, uses only opacity and position, and happens once:
when real figures replace a loading skeleton. A user who returns to a dashboard that is already loaded
sees it straight away.

| Requirement (intent) | How it falls out |
|---|---|
| Icon on every tile, colour only in the icon (1, 2) | `IconChip` (§3) on neutral `Tile`s; at most 4 tones from existing tokens |
| Rent overdue still stands out (2) | It stays the only tile with a coloured ring |
| Two levels of importance, less space (3, 4) | Key figures keep full size; What we own becomes one compact card in 4 sections (§4) |
| Light load animation (5) | One entrance animation, chart and bars grow once, all behind `motion-safe` (§5) |
| Figures never move | Animation is applied to cards, never to text; no count-up |
| Same figures (constraint) | No SQL, RPC, query or model change to any figure; test ids kept |

## 2. Layout

Spec 002 §2 is unchanged except row 1b:

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ ▣ Cash & bank│ ▣ Net profit │ ▣ Total      │ ▣ Rent       │   row 1: Key figures, 4 tiles, full size
│ Rs 4,250,000 │ Rs 1,180,500 │   invested   │   overdue    │
├──────────────┴──────────────┴──────────────┴──────────────┤
│ ▪ Properties │ ▪ Vehicles   │ ▪ Gold       │ ▪ Silver     │   row 1b: What we own, ONE card,
│ Rs 28.4M …   │ …            │ …            │ None held    │   4 sections with thin dividers
└──────────────┴──────────────┴──────────────┴──────────────┘
```

- Desktop (≥ 1024 px): row 1 is 4 tiles; row 1b is one card with 4 sections side by side.
- Phone and tablet (< 1024 px): row 1 is 2 × 2 tiles; row 1b is one card with 2 × 2 sections.
- Grids use `grid-cols-2` / `lg:grid-cols-4` (`minmax(0, 1fr)` tracks via Tailwind). No horizontal scroll at 375 px.

## 3. Icon chip

A rounded square holding a lucide icon, placed left of the tile's label on the same line.

| Size | Square | Icon | Used in |
|---|---|---|---|
| Regular | 32 px (`size-8`, `rounded-lg`) | 16 px | Key figure tiles |
| Small | 24 px (`size-6`, `rounded-md`) | 14 px | What we own sections |

Tones (decided in the intent, open question 1; amended 2026-10-02 by the product owner: Total invested is
blue and the Rent overdue icon is always red, while the red ring stays only for rent overdue > 0). A tint is the tone's colour at about 12 % over the card
(about 20 % in dark mode, so it does not fade out); the icon uses the full colour.

| Tone | Colour token | Used by |
|---|---|---|
| `blue` | `--chart-1` | Cash & bank, Total invested |
| `green` | `--chart-3` | Net profit, when ≥ 0 |
| `amber` | `--chart-4` | Gold |
| `red` | existing danger red (`red-600` / dark `red-400`) | Rent overdue, always |
| `neutral` | `bg-muted` / `text-muted-foreground` | Everything else, including Net profit < 0 |

Icons (lucide-react, already a dependency):

| Tile | Icon |
|---|---|
| Cash & bank | `Wallet` |
| Net profit | `TrendingUp`, or `TrendingDown` when the figure is negative |
| Total invested | `Landmark` |
| Rent overdue | `CalendarClock`; `TriangleAlert` when > 0 (keeps the "never colour alone" rule of spec 002 §3.1) |
| Properties | `Building2` |
| Vehicles | `Car` |
| Gold | `Gem` |
| Silver | `Coins` |

- Icons are `aria-hidden`. The label text still names the tile and is still the link.
- The choice of tone and icon from a figure (sign of net profit, overdue > 0) is a pure function in
  `model.ts`, so it is unit tested.

## 4. Tiles and the What we own card

**Key figure tiles** (`Tile`):
- Top line: chip + label (`text-sm`, muted; red when overdue). Below: value and sub-line as today.
- **Top strip** (amendment 1, 2026-10-02, product owner): a 2 px strip along the top edge in the tile's
  tone (blue, green, red; grey for neutral), clipped by the tile's rounded corners. Key figures only: it
  sets them apart from the compact What we own card. Rent overdue > 0 still also has its red ring.
- Padding `p-4`, value size unchanged (`text-lg`, `sm:text-2xl`).
- Hover: background goes to `bg-accent/50` with `transition-colors` (150 ms). No shadow, no lift
  (intent open question 3).
- Rent overdue > 0: `ring-2` red as today, red label, red chip with `TriangleAlert`.

**What we own** becomes one card (`bg-card`, thin ring, `rounded-xl`) under the existing "What we own"
row heading. Each of the 4 sections:
- Small chip + label, value (`text-base`, `sm:text-lg`, semibold), sub-line (`text-xs`).
- Padding `p-3` (`sm:px-4`). Sections are separated by 1 px `border` lines: vertical between columns,
  and on phones also horizontal between the two rows.
- The label is still a link stretched over its own section (same pattern as `Tile`), with its own hover
  background, so each class opens its own page.
- Keeps `data-testid` `asset-property`, `asset-vehicle`, `asset-gold`, `asset-silver` and `held-cost`,
  and the "None held" state.
- Loading: one skeleton per section. A failed query shows `SectionError` inside the sections it feeds,
  as today.

**Section blocks below the tiles** (intent open question 2): `Block` gets an optional `icon`, drawn as a
plain 16 px muted icon before the title (no square, no colour):

| Block | Icon |
|---|---|
| Income, expenses and profit | `ChartColumn` |
| Needs attention | `Bell` |
| Portfolio | `Building2` |
| Where this year's profit came from | `ChartBar` |
| Cash by account | `Wallet` |
| Who owes whom | `ArrowLeftRight` |
| Latest entries | `History` |

## 5. Motion

All motion is wrapped in Tailwind's `motion-safe:` variant (or, for Recharts, a
`prefers-reduced-motion` check), and uses only `opacity` and `transform`, which never move other
elements or cause sideways scroll.

| What | When | How |
|---|---|---|
| Card entrance | Content replaces a skeleton in `Loaded` | Fade in and rise from 6 px below, 220 ms, ease-out `cubic-bezier(.2,.7,.3,1)`, fill `both` |
| Stagger | Tiles in a row, sections of the What we own card | Delay = position × 40 ms (max 120 ms) |
| Chart | First draw of the performance chart | Recharts animation on: bars grow, line draws, 500 ms ease-out. Off when switching 6/12 months and when it first draws from cache |
| Share bars | Portfolio bar, profit-mix bars, cash-by-account bars, first appearance from a skeleton | Width grows from 0, 500 ms ease-out, 100 ms delay |
| Hover | Tiles, sections, "more" links | Colour transition, 150 ms |

Rules:
- **Only after a skeleton.** `Loaded` remembers whether it showed the skeleton. If the data was already
  cached when the block mounted, nothing animates. The same signal (a small context from `Loaded`) tells
  share bars and the chart whether to animate.
- **Never on figures.** Text is never counted, typed out or swapped while visible. The sparkline does
  not animate.
- **Reduce motion:** no entrance, no growing bars, no chart animation. Colour transitions on hover
  stay (they are not motion).
- **Print:** `@media print` turns animations and transitions off, so a page printed while loading still
  shows finished cards.
- No new dependency: keyframes come from `tw-animate-css` (already imported) or a few lines in
  `index.css`.

## 6. Frontend

Files in `web/src/features/dashboard/`:
- `parts.tsx`: `IconChip`; `Tile` takes `icon` and `tone`; new `AssetCard` + `AssetSection`; `Block`
  takes `icon`; `Loaded` adds the entrance class and provides the "animate" context; `ShareBar` reads it.
- `HeadlineTiles.tsx`, `AssetTiles.tsx`: pass icons and tones; `AssetTiles` renders the one card.
- `PerformanceChart.tsx` / `PerformanceCard.tsx`: chart animation as in §5.
- `model.ts`: pure `tileTone` helpers (§3).
- `index.css`: entrance keyframes (if not taken from `tw-animate-css`) and the print rule.

`CLAUDE.md` gets a short **Motion** rule: `motion-safe` only, opacity/transform only, only when content
replaces a skeleton, never on figures, off in print.

No database change: no migration, RPC, `database.types.ts`, pgTAP or eval change.

## 7. Tests and acceptance

### Unit (Vitest)
1. `tileTone`: cash → blue; net profit 0 and positive → green `TrendingUp`, negative → neutral
   `TrendingDown`; overdue 0 → red `CalendarClock`, > 0 → red `TriangleAlert`; total invested → blue; gold → amber;
   silver, vehicles, properties → neutral.
2. `Loaded` (Testing Library): pending then success → content has the entrance class; mounted with
   data already present → no entrance class; error → `SectionError`, no entrance class.

### e2e (Playwright)
3. Existing dashboard and holdings assertions pass unchanged (`asset-*`, `held-cost`, `rent-overdue`,
   `invested-total`, the `Silver` link inside `asset-silver`).
4. Each key-figure tile and each What we own section shows an icon, and each section's link opens its
   page (`/properties`, `/vehicles`, `/gold`, `/silver`).
5. With `reducedMotion: 'reduce'`, the tiles' computed `animation-name` is `none`.
6. Rent overdue > 0: the tile has the red ring and the alert icon; at 0 it has the red calendar icon and no ring.
7. 375 px, light and dark: `expectNoHorizontalScroll` after content has loaded (existing test, now
   covering the compact card).

### Definition of done
Everything above passes, plus `npm run check`, `npm run db:test`, `npm run evals` and `npm run e2e`.
Checked in the browser at desktop and 375 px, light and dark. Spec 002 §3.1a gets a note: "look changed
by spec 005 (one compact card)".

## 8. Out of scope

New figures or tiles, changes to the blocks' content, rearrangeable tiles, a new app-wide colour theme,
animating the sparkline or any figure, page-transition animations.

## Approval

- [x] Product owner approves this spec → proceed to Stage 3 (`plan.md`)
