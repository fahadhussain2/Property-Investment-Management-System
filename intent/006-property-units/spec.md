# Spec 006 — Units: several tenants in one property

> Stage 2 artifact. Derived from [`intent.md`](intent.md). Changes the lease rule of spec 001 (§6.7, M6:
> "leases on the same property never overlap") and adds occupancy to the property page and register.
> Status: **APPROVED** by Fahad Hussain, 2026-10-02 · **DONE** 2026-10-02 (plan 006 U1–U2)

## 1. Design principle: "units are a room list, not a second set of books"

A property can have an optional list of **units**. A lease is for one unit or for the whole property.
Units change who may rent what and when; they never touch the books.

| Requirement | How it falls out |
|---|---|
| Several tenants at once | The overlap check compares leases on the same unit, not the same property |
| A unit is never rented twice | Same check, same unit: refused |
| Whole property vs. its units | A whole-property lease overlaps every unit, and the other way round: refused |
| Properties without units unchanged | No units → every lease is a whole-property lease → today's rule, today's message |
| See what is empty | `property_units_overview` and `properties_overview` derive each unit's state from leases (rule 7) |
| Books per property | No change to `post_voucher`, `journal_lines`, accounts or reports. Rent stays linked to its lease |
| Rent never counted twice | Rent with no lease counts towards one lease only, and is refused when the choice is ambiguous (§5) |

**Safety requirement.** Existing data, entries and behaviour are unchanged. Every existing pgTAP test,
eval case, unit test and e2e test must pass **without being edited**. If one needs editing, that is a
finding to report to the product owner, not a fix.

## 2. Glossary additions

| Term | Meaning |
|---|---|
| **Unit** | A part of a property rented on its own: a floor, a flat, a shop, a portion. Has a name ("Ground floor", "Shop 3") and an optional note. Code: table `property_units` (not `units`, which would be confused with weight units in spec 003). |
| **Whole-property lease** | A lease with no unit. Every lease today is one. |
| **Occupancy** | For a property with units: how many of its units are rented today, e.g. "2 of 3 units rented". |

"Tenant" keeps its meaning (a renter, a party). "Organization" keeps its meaning (`org_id`).

## 3. Data model

```
property_units(
  id uuid pk default gen_random_uuid(), org_id uuid not null → organizations on delete cascade,
  property_id uuid not null,
  name text not null,          -- trimmed, 1–60 characters
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, property_id, id),
  foreign key (org_id, property_id) references properties (org_id, id) on delete cascade
)
unique index on (org_id, property_id, lower(btrim(name)))   -- no two "Shop 3" in one property

leases + unit_id uuid null
  foreign key (org_id, property_id, unit_id) references property_units (org_id, property_id, id)
```

- `unit_id is null` means a whole-property lease. Existing rows get null, so they mean what they mean today.
  No data is rewritten.
- The three-column foreign key makes it impossible for a lease to point at a unit of another property or
  another organization (with MATCH SIMPLE, a null `unit_id` skips the check). It is `on delete restrict`:
  a unit that has (or had) leases can't be deleted.
- A property can be deleted only when nothing points at it (as today); its units go with it (cascade).
- **RLS** (rule 3), the same as other master data (`properties`, `leases`): select for `is_member(org_id)`;
  insert, update, delete for `has_role(org_id, '{owner,accountant}')`.
- Only `name` and `notes` can be updated: `update` is granted on those two columns only. A unit never moves
  to another property.
- Index on `leases (org_id, unit_id)`.

## 4. Lease rules (`check_lease`, replaced by `create or replace` in a new migration, rule 9)

Unchanged: the advisory lock per property, "sold and cannot be rented", "property and tenant fixed once
entries point at the lease", the party gets the tenant role.

Changed: two leases on the same property **conflict** when their date ranges overlap (inclusive, open-ended =
forever, exactly as today) **and** either one is a whole-property lease or both are on the same unit.

| New lease | Overlapping existing lease | Result and message (SQL → friendly text in `lib/forms.ts`) |
|---|---|---|
| Whole property | Whole property | Refused: `this property already has a lease for these dates` (**unchanged**) |
| Unit U | Same unit U | Refused: `this unit already has a lease for these dates` → "This unit already has a lease for these dates. End the current lease first, or change the dates." |
| Unit U | Whole property | Refused: `the whole property is rented for these dates` → "The whole property is rented for these dates. End that lease first, or change the dates." |
| Whole property | Any unit | Refused: `a unit of this property is rented for these dates` → "A unit of this property is rented for these dates, so it can't be rented as a whole. End the unit's lease first, or change the dates." |
| Unit U | Unit V (different) | **Allowed** |

- A lease's unit **can** be changed after entries point at it (a correction): the unit is not copied onto
  entries, and the books are per property. The new unit is checked for overlap like any update.
- The lease form shows a **Unit** choice when the property has units. It is then required, with the
  choices "Whole property" and each unit. It never defaults silently to the whole property, because that
  would block every unit. For a property without units it shows a read-only "Whole property" line with
  "New unit" (amended at Stage 3, U2), and a save made before the units have loaded waits for them.

## 5. Rent and deposits entered without a lease

Today, rent entered with "No lease: choose property & tenant" counts towards every lease of that property
and tenant whose dates cover the entry. That is at most one lease today (no overlaps). With units, one tenant
can rent two units of a property at once, and the payment would be counted twice (arrears understated).

1. **Rent roll: counted once.** A rent entry with no lease counts towards **one** lease: of the leases with the
   same property and tenant whose counted period (`rent_counted_from`/start → end) covers the entry date, the
   one that started first (then lowest id). Deposits with no lease already go to exactly one lease; unchanged.
   For every existing case (at most one candidate) the result is identical.
2. **New entries: the lease must be chosen when it's ambiguous.** A `rent` or `deposit` voucher with no lease is
   refused when its property and tenant have **two or more leases active on the entry date**:
   `this tenant has more than one lease on this property on that date: choose the lease` → "This tenant rents
   more than one unit here on that date. Choose the lease the payment is for." Enforced in SQL (a `before
   insert` trigger on `vouchers`, so `post_voucher`, `preview_voucher` and `edit_voucher` all get it without
   rewriting `post_voucher`). Reversals (`reverses_id is not null`) are exempt, so a void always works.
   Editing an old entry with no lease in that situation asks for the lease too (the edit reposts it).
   This can only happen once a tenant has two leases at once, which is impossible today.
3. No other entry type changes. Expenses, property costs and the sale stay on the property.

## 6. Derived state (rule 7: nothing stored)

**`property_units_overview`** (view, `security_invoker`), one row per unit, "today" = `org_today(org_id)` (rule 8):
`id, org_id, property_id, name, notes, created_at, state, lease_id, tenant_id, tenant_name, lease_ends,
lease_count`, where:
- `state = 'rented'` when a lease on the unit is active today (start ≤ today ≤ ended_on/end_date/forever);
- `state = 'whole_property'` when a whole-property lease is active today;
- `state = 'vacant'` otherwise;
- `lease_id`, `tenant_*`, `lease_ends` describe the active lease (unit or whole property), else null;
- `lease_count` = all leases ever on the unit (the UI offers Delete only at 0; the FK enforces it).

**`properties_overview`** is recreated (it selects `p.*`, so it must be dropped and created again; nothing
in SQL depends on it) with two extra columns: `units_total`, `units_vacant`. `status` is unchanged:
`property_status()` already says `rented` while any lease is active, unit or whole.

**`rent_roll`** gains `unit_id, unit_name` (appended; the return type changes, so drop and recreate as M7 did)
and sorts by property code, unit name (whole property first), then start date desc. All other columns and
figures are unchanged, except for the single-attribution rule in §5.1.

**`expiring_leases`** gains `unit_name` (drop and recreate).

**`documents_overview`**: a lease's `record_label` becomes `code · unit · tenant` when it has a unit
(`create or replace view`, same columns).

`property_status()`, `post_voucher()`, `edit_voucher()`, `preview_voucher()`, account balances and every
financial report are **not changed**.

## 7. Screens

| Where | What |
|---|---|
| Property page (`/properties/:id`) | New **Units** section above Leases: each unit with its state ("Rented to Ali Traders until 30 Jun 2027", "Part of the whole-property lease", "Vacant") and a link to the lease. Header line "2 of 3 units rented". Actions (when `canWrite`): Add unit, Rename / edit note, Delete (only when the unit never had a lease; otherwise the action explains why). Empty state: "No units. This property is rented as a whole. Add units if parts of it are rented separately." Hidden for a sold property with no units. |
| Unit dialog (`FormDialog`) | Name (required, 1–60), Notes (optional). Duplicate name → "This property already has a unit with that name." |
| Properties list | Under the status badge, for a property with units that is not sold: "2 of 3 units rented". Nothing new for properties without units. |
| Lease form | **Unit** select after Property, when that property has units (without units: a read-only "Whole property" line with "New unit"): "Choose a unit…" (placeholder, required), "Whole property", then units by name. A "New unit…" option opens the unit dialog inside the lease dialog and selects the new unit. Changing the property clears the unit. |
| Lease page, rent roll (`/leases`), lease picker in rent/deposit entries, dashboard (Rent overdue, Leases ending), documents | The unit is shown after the property code: `DP-25 · Shop 3 · Ali Traders`. A whole-property lease shows as today. |

- A failed load shows `SectionError`, never "0 of 0 units".
- Everything works at 375 px with no sideways scroll (`grid-cols-1`; long unit names wrap).
- No new page, so no new `<h1>`.

## 8. Migrations (append-only, rule 9)

1. `property_units` table, RLS, grants, `leases.unit_id` + FK + index.
2. `check_lease` (create or replace), the `vouchers` trigger (§5.2), `rent_roll` and `expiring_leases`
   (drop and recreate), `properties_overview` (drop and recreate), `property_units_overview`,
   `documents_overview` (create or replace). Base each on its **latest** definition.
3. `npm run db:types`.

Deploy is additive: no existing row is rewritten. The pre-deploy backup runs as usual.

## 9. Acceptance scenarios (these become evals, pgTAP and e2e)

**Unchanged behaviour (regression)**
1. A property with no units: a second, overlapping lease is refused with today's message ("This property
   already has a lease for these dates…"). The existing pgTAP test and e2e test pass as written.
2. All existing evals (01–14), pgTAP files (01–12), unit tests and e2e specs pass without edits. Eval 09's
   rent-roll figures are identical.

**Units and leases**
3. Property H-10 gets units "Ground floor" and "1st floor". Ground floor is leased to Tenant A and 1st floor
   to Tenant B for the same dates (2026-10-02 → 2027-06-30). Both are saved. H-10 is **Rented**, "2 of 2
   units rented".
4. A second lease on Ground floor overlapping Tenant A's is refused: "This unit already has a lease…".
5. A whole-property lease on H-10 overlapping either unit lease is refused, and a unit lease overlapping an
   active whole-property lease is refused, each with its own message.
6. A whole-property lease on a property with units, with no unit lease at the same time, is allowed. Its units
   show "Part of the whole-property lease", and occupancy is "2 of 2".
7. Tenant A's lease is ended on 2026-12-31. As at 2027-01-01, Ground floor is vacant, occupancy is "1 of 2",
   and status is still Rented. When both leases have ended, status is Vacant.
8. A lease can't point at a unit of another property, or of another organization (FK). Changing a lease's
   property while it has a unit is refused unless the unit is changed too.
9. Unit names are unique within a property, ignoring case and spaces at the ends ("shop 3 " = "Shop 3"); the
   same name on another property is fine.
10. A unit with a lease can't be deleted; one that never had a lease can. Renaming a unit shows the new name
    on the lease, rent roll and documents.
11. A lease that has entries can move to another unit of the same property; its property and tenant still can't change.

**Rent never counted twice**
12. Tenant C rents Shop 1 from 2026-01-01. A rent of 50,000 dated 2026-02-05 is entered with no lease.
    Then Tenant C also rents Shop 2, backdated to 2026-02-01. The 50,000 counts towards Shop 1 only: the
    total received across both leases is 50,000, not 100,000.
13. After that, a new rent entry for Tenant C on H-10 dated 2026-03-05 with no lease is refused ("Choose the
    lease…"). With the Shop 2 lease chosen, it is accepted and counts towards Shop 2 only. Its preview shows
    the same error before saving. Voiding an old unlinked entry still works.
14. Two different tenants on two units each pay rent with no lease chosen: each payment counts towards its own
    tenant's lease (the tenant decides; no refusal).

**Books unchanged**
15. Rent for both units appears under H-10 in the income statement, totalling the sum of both leases' rent.
    Balance sheet and trial balance are unaffected by units.

**Security and display**
16. A viewer sees units but can't add, rename or delete them (UI hidden; direct table writes fail under RLS).
    A member of org B can't see org A's units (pgTAP cross-org).
17. The rent roll, lease picker, dashboard rows and lease documents show `code · unit · tenant`.
18. The Units section, unit dialog, lease form and rent roll have no sideways scroll at 375 px.

## 10. Out of scope (intent 006)

Reports or profit per unit; selling a unit on its own; units for vehicles, gold or silver; per-unit details
beyond a name and a note (size, suggested rent). Possible later: a suggested rent per unit to prefill the lease form.

## Approval

- [x] Product owner approves this spec → proceed to `plan.md`
