# Plan 006 — Units: several tenants in one property

> Stage 3 artifact. Implements [`spec.md`](spec.md). Each milestone is one PR on its own branch and ends
> with a **verification gate** that the `verifier` subagent must pass before asking for human review.
> Status: **DONE**, 2026-10-02 · U1 ✅ merged (PR #29: 328 pgTAP, 16/16 evals, 115 unit, e2e 33/33) · U2 ✅ (this PR:
> 124 unit, e2e 37/37; checked at desktop and 375 px, light and dark). No existing test edited in either.

**Standing rule for both milestones (spec §1):** no existing test file, eval case or e2e spec may be edited
to make it pass. New tests go in new files or new cases. If an existing test fails, stop and report it to
the product owner with the output. Only new assertions may be *appended* to an existing pgTAP file's plan,
and only where the spec says so.

## U1 — Data and rules (branch `feat/property-units-data`)

Database only, plus the generated types and the friendly error messages. Can merge on its own: with no
units created, the app behaves exactly as before (every lease stays whole-property).

### Migrations (new files, rule 9)

- `supabase/migrations/20261006000001_property_units.sql`:
  - table `property_units` (spec §3): name check `btrim(name) <> '' and length(btrim(name)) <= 60`,
    `unique (org_id, id)`, `unique (org_id, property_id, id)`, FK `(org_id, property_id)` → `properties`
    `on delete cascade`, unique index `(org_id, property_id, lower(btrim(name)))`
  - RLS enabled; the four master-data policies (`is_member` select; `has_role(org_id, '{owner,accountant}')`
    insert/update/delete), written out like `20260925000002_rls.sql` does
  - grants: `select, insert, delete` and `update (name, notes)` only, to `authenticated`; nothing to `anon`
  - `alter table leases add column unit_id uuid`; FK `(org_id, property_id, unit_id)` →
    `property_units (org_id, property_id, id)` `on delete restrict`; index `leases (org_id, unit_id)`
- `supabase/migrations/20261006000002_property_units_rules.sql`, each based on its **latest** definition:
  - `check_lease` (`create or replace`; base `20260930000001_leases.sql`): the overlap query adds
    `and (l.unit_id is null or new.unit_id is null or l.unit_id = new.unit_id)`, then picks the message of
    spec §4 from the first conflicting row (same unit / existing whole / new whole). Everything else
    unchanged, including the advisory lock and today's message for whole vs. whole.
  - `check_unlinked_rent()` + `before insert` trigger on `vouchers` (spec §5.2): only for
    `type in ('rent','deposit') and lease_id is null and reverses_id is null and property_id and party_id
    are set`; counts leases of that property and party active on `new.date`; ≥ 2 → raise (errcode `22023`).
  - `rent_roll` (drop and recreate; base `20261001000001_go_live.sql`): append `unit_id, unit_name`; the
    unlinked `rent_income` branch becomes "this lease is the first-started lease of the same property and
    party whose counted period covers the entry date" (spec §5.1); order by `upper(code)`,
    `unit_name nulls first`, `start_date desc`. All other expressions copied unchanged.
  - `expiring_leases` (drop and recreate; base `20260930000001_leases.sql`): adds `unit_name`.
  - `properties_overview` (drop and recreate; base `20260925000005_reports.sql`): adds `units_total`,
    `units_vacant` (using the same "active today" test as `property_units_overview`).
  - `property_units_overview` (new view, `security_invoker`), spec §6.
  - `documents_overview` (`create or replace view`, same columns; base `20261004000001_documents.sql`):
    lease label `code · unit · tenant`.
  - Re-apply the existing revoke/grant pattern for the recreated functions and views.
- `npm run db:types`.

### Friendly messages

- `web/src/lib/forms.ts`: map the four new SQL messages (spec §4, §5.2), the duplicate unit name
  (unique index), and the unit FK violations ("This unit belongs to another property…", "This unit has
  leases, so it can't be deleted.") to plain text. Unit tests for each mapping in a new test file.

### Tests

- pgTAP `supabase/tests/13_property_units.sql` (new file):
  - RLS on `property_units`; viewer can select but not insert/update/delete; org B sees none of org A's units
    and can't attach a lease to them (rule 3, cross-org)
  - only `name`/`notes` updatable; duplicate names refused ignoring case and outer spaces; same name on
    another property allowed
  - the five rows of the spec §4 table, each with its exact message; touching ranges (end = next start) still conflict
  - a property with no units: overlapping leases refused with today's message (spec §9.1)
  - lease → unit of another property refused (FK); changing a lease's property while it keeps its unit refused
  - unit with a lease can't be deleted; unit without leases can; property delete cascades to unused units
  - a lease with entries can change unit; still can't change property or tenant
  - `property_units_overview` states (rented / whole_property / vacant) and `properties_overview`
    `units_total`/`units_vacant` as at today, using `org_today` (rule 8)
  - `property_status` stays `rented` with one of two units let, `vacant` when all have ended (spec §9.7)
  - the voucher trigger: unlinked rent/deposit refused with two active leases for the same tenant; allowed with
    a lease chosen, with one active lease, and for two different tenants; `preview_voucher` returns the same
    error; a void of an older unlinked entry succeeds (spec §9.13–14)
  - `rent_roll`: unlinked rent counted towards one lease only (spec §9.12); `unit_name` filled
  - `documents_overview` lease label includes the unit
- Evals: extend `evals/run.mjs` (and `evals/README.md`):
  - `setup.units: [{ key, property, name }]`; `setup.leases[].unit` (unit key); `setup.leases[].end`
    already exists
  - a `lease` step to add a lease between entries (needed to backdate Shop 2 after a payment)
  - `rent_roll` expectations keyed by lease key as well as by property code (`"lease:L-GF": {…}`), because
    one property now has several rows. Keying by code keeps working for existing cases.
  - New cases (existing 01–14 untouched):
    - `15-units-two-tenants-one-house.json`: spec §9.3, §9.7 and §9.15 (two units, rent on both, rent roll per
      lease, income statement per property = sum, trial balance difference 0)
    - `16-units-rent-counted-once.json`: spec §9.12–14 (backdated second lease, unlinked rent counted once,
      ambiguous new rent refused via `post_voucher_error`, accepted with the lease)
- Clarified while building U1:
  - The unit FK on leases is `no action`, not `restrict`: deleting a unit with leases is refused either way, but
    `restrict` is checked immediately and could block an organization's cascade delete.
  - The properties list and property page read `property_summary()`, not `properties_overview`. `property_summary` is
    left unchanged (the dashboard and reports use it); U2 reads `units_total`/`units_vacant` from `properties_overview`.
    The recreated view joins units, so it is no longer auto-updatable; nothing wrote through it.
  - Unit messages map in `lib/forms.ts` before the whole-property message, which shares its wording.
- **Gate:** `npm run db:reset`, `npm run db:test` (all files, existing ones unedited), `npm run evals` 16/16,
  `npm run db:types` produces no diff, `cd web && npm run check`, `cd web && npm run e2e` (existing specs,
  unchanged, prove the UI still works on the new schema).

## U2 — Screens (branch `feat/property-units-ui`, after U1 merges)

- `web/src/features/properties/`:
  - `units.ts` (pure, no `lib/supabase`): occupancy text ("2 of 3 units rented"), unit state text
    (spec §7), lease label `code · unit · tenant`, whether Delete is offered. `units.test.ts`.
  - `unitsApi.ts` or additions to `api.ts`: keys under `['properties', orgId, 'units', propertyId]`;
    fetch from `property_units_overview`; create / update (name, notes) / delete on `property_units`.
    Unit writes also invalidate `['leases', orgId]` (labels) and the properties list (occupancy).
  - `schema.ts`: unit zod schema (name 1–60 trimmed, notes optional).
  - `UnitFormDialog.tsx` (`FormDialog`; works nested inside the lease dialog).
  - `UnitsSection.tsx` on `PropertyPage` above Leases: occupancy line, rows with state and lease link,
    actions behind `canWrite`, empty state, `SectionError` on failure. Hidden for a sold property with no units.
  - `PropertiesPage.tsx`: occupancy line under the status badge when `units_total > 0` and not sold.
- `web/src/features/leases/`:
  - `schema.ts`: `unit_id` (uuid or null); required when the chosen property has units, with
    "Whole property" as an explicit choice (a sentinel value mapped to null on save).
  - `LeaseFormDialog.tsx`: Unit select after Property (spec §7), "New unit…" opens `UnitFormDialog` and
    selects the result; changing the property clears the unit.
  - `rentRoll.ts` (`toRollRow`), `RollList.tsx`, `LeasePage.tsx`: show the unit using the shared label helper.
- `web/src/features/entries/fields.tsx` (`LeasePicker`): option label includes the unit.
- `web/src/features/dashboard/`: Rent overdue and Leases ending rows use the label with the unit
  (`model.ts` + its test).
- Documents need no change (the label comes from `documents_overview`).
- e2e `web/e2e/units.spec.ts` (new file; existing specs untouched), unique users per test:
  - add a property, two units, a lease on each for the same dates (the reported scenario: 2026-10-02 →
    2027-06-30); occupancy "2 of 2 units rented"; status Rented
  - a third overlapping lease on the same unit shows the unit message; a whole-property lease shows its message
  - "New unit…" from inside the lease dialog
  - rent roll and lease picker show the unit
  - viewer sees units but no Add / Rename / Delete
  - `expectNoHorizontalScroll` at 375 px on the property page (Units section), the unit dialog, the lease
    form and `/leases`
- Clarified while building U2:
  - A property without units still shows a read-only "Unit" line in the lease form with "New unit", so the first unit
    can be added while creating the lease (the reported case: a new building, then its first lease).
  - The lease form sends a hidden `unit_state` (none / some / loading / error). Only "some" with a choice counts as
    chosen; otherwise the dialog looks the units up before saving (see the gate fix below), so a lease never becomes a
    whole-property lease by accident.
  - The dashboard needed no test of its own: its rows use `leaseLabel()`, covered by `units.test.ts` and `units.spec.ts`
    (existing dashboard tests are not edited, per the standing rule).
  - Lease rows on the property page always stack (narrow column), so `code · unit · tenant` reads on one line, and
    lease names in `RollList` wrap instead of being cut off (they are longer with a unit).
  - Verifier gate, first run: the existing `dashboard.spec.ts` failed under full-suite load. The lease form refused a
    quick save with "wait for the units to load" (even for a property without units). Fixed in the form, not the
    test: the dialog now waits for the units (`fetchQuery`) before deciding, and an unchanged lease keeps its unit.
    Regression e2e: "saving before the units arrive waits for them instead of refusing" (units response held back).
- Close-out: mark spec and plan **DONE**; `CLAUDE.md`: units rule (overlap is per unit, a whole-property
  lease overlaps all units, a new lease-reading query must use `unit_id`, unlinked rent counts towards one
  lease), and add `property_units` to the naming notes ("Unit" = part of a property, not a weight unit).
- **Gate:** `cd web && npm run check`, `cd web && npm run e2e` (new and existing specs), U1's gates still
  green, and a browser check at desktop and 375 px, light and dark.

## Risks and how the plan covers them

| Risk | Covered by |
|---|---|
| Existing behaviour changes for properties without units | Spec §9.1–2; standing rule (existing tests unedited); U1 gate runs the existing e2e suite on the new schema |
| Rent counted twice for a tenant with two units | Single attribution in `rent_roll` + the voucher trigger; pgTAP + eval 16 |
| Recreating `rent_roll` / `expiring_leases` / `properties_overview` drops a column or a grant | Based on the latest definitions; regenerated types must only *add* fields; existing pgTAP 08/09/10 and evals 02/09/10 unchanged and green |
| A lease points at a unit of another property or organization | Three-column composite FK, not a trigger; pgTAP cross-org |
| Production deploy | Additive migrations only; pre-deploy backup as usual |
