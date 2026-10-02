# Plan 005 — Dashboard look and feel

> Stage 3 artifact. Implements [`spec.md`](spec.md). One milestone, one PR, ending with a **verification
> gate** that the `verifier` subagent must pass before asking for human review.
> Status: **L1 built**, 2026-10-02 (branch `feat/dashboard-look-and-feel`): 106 unit, 268 pgTAP, 14/14 evals,
> e2e 33/33; checked in the browser at desktop and 375 px, light and dark. Amendment 1: top strip on key figures.

## L1 — Icons, compact What we own, light motion (frontend only)

No database change, so no migration, `db:types`, pgTAP or eval work. The gate still runs them all.

- `web/src/features/dashboard/model.ts` (pure): `TileTone`, `TileIcon` names and the tone/icon helpers of
  spec §3 (`CASH_LOOK`, `INVESTED_LOOK`, `profitLook(net)`, `overdueLook(total)`, `ASSET_LOOK`), returning
  names, not components, so the module stays free of React.
- `web/src/features/dashboard/motion.tsx`: `AnimateContext` (true when content replaces a skeleton),
  `useAnimateIn()`, and `usePrefersReducedMotion()` for Recharts.
- `web/src/features/dashboard/parts.tsx`:
  - `IconChip` (regular / small, tones of spec §3), icon lookup from the names in `model.ts`
  - `Tile` takes `look` (icon + tone) and `index` (stagger); chip + label on one line; a 2 px top strip in its tone (amendment 1)
  - `AssetCard` + `AssetSection`: one card, 4 sections, dividers, a stretched link per section
  - `Block` takes an optional plain `icon`
  - `Loaded` remembers whether it showed the skeleton (`useRef`), wraps the content in the entrance class
    and provides `AnimateContext`; `ShareBar` grows only under it
- `HeadlineTiles.tsx`, `AssetTiles.tsx`: icons, tones, the one card. Test ids unchanged.
- `PerformanceCard.tsx` / `PerformanceChart.tsx`: animate the chart on its first draw only, and only after
  a skeleton and without reduced motion. Switching the range does not animate.
- `Cards.tsx`: the portfolio bar grows from the left under the same rule.
- `DashboardPage.tsx` and the blocks: block icons (spec §4 table).
- `web/src/index.css`: `dash-in` and `dash-grow` keyframes, the `motion-safe` utilities, and animations and
  transitions off in `@media print`.
- `CLAUDE.md`: the Motion rule (spec §6). Spec 002 §3.1a: note "look changed by spec 005".
- Tests:
  - `model.test.ts`: tone/icon cases (spec §7.1)
  - `parts.test.tsx`: `Loaded` entrance only after a skeleton, not when mounted with data, not on error (§7.2)
  - `e2e/dashboard.spec.ts`: icons on tiles and sections, section links, reduced motion → `animation-name`
    `none`, overdue ring and alert icon vs. the neutral state, 375 px light and dark (§7.3–7.7)
- **Gate:** `npm run check`, `npm run db:test`, `npm run evals`, `npm run e2e`; browser check at desktop and
  375 px, light and dark, with a screenshot in the PR.
