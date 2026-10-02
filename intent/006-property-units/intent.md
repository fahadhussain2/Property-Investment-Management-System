# Intent 006 — Units: several tenants in one property

> Stage 1 artifact (AI-Native SDLC). Written from the business owner's own words.
> Status: **APPROVED** by Fahad Hussain, 2026-10-02
> Owner: Fahad Hussain · Date: 2026-10-02

## Problem

The system assumes a property is rented to one tenant at a time: a second lease that overlaps the first
is refused ("This property already has a lease for these dates"). That is wrong for a lot of what we own:

- a house whose ground floor is rented to one tenant and the 1st floor to another;
- a building with two or more flats;
- a plaza or building with several shops.

This is normal, not an exception. Today the only workaround is to add each floor or shop as its own
property, but the building was bought in one deal for one price, and that cost can't be split cleanly.

## Desired outcome

1. **A property can have units.** We can list the parts of a property that are rented separately
   ("Ground floor", "1st floor", "Flat 2", "Shop 3"). Units are optional: a house rented whole has none
   and works exactly as today.
2. **Each lease is for a unit, or for the whole property.** Different units can be rented to different
   tenants at the same time. The same unit can never be rented twice for the same dates, and a lease
   for the whole property can't overlap a lease on any of its units.
3. **We can see what is empty.** The property page and the properties list show occupancy, e.g.
   "2 of 3 units rented", and which units are vacant. A property shows **Rented** while any unit is rented.
4. **Rent is followed per tenant, as now.** The rent roll, months unpaid and leases ending soon work for
   each lease and show its unit next to the tenant.
5. **Nothing already recorded changes.** Existing properties, leases and entries stay as they are.

## Users

Same as intent 001: the owner and staff now, subscribing businesses later.

## Constraints

- **Books are per property.** Purchase, costs, expenses, rent income and the sale stay on the property;
  units are not a separate line in the books or the reports (decided 2026-10-02).
- **No new status.** Status stays derived (rule 7): sold > under agreement > rented > vacant.
- **Tenant isolation.** Units belong to one organization, like every other table.
- **Mobile.** Usable at 375 px width with no sideways scrolling.

## Out of scope (for now)

- Profit, expenses or reports per unit
- Selling one unit on its own (the property is still sold as a whole)
- Units of vehicles, gold or silver
- Different sizes, rents or details per unit beyond a name and an optional note

## Decisions (agreed 2026-10-02)

1. **Units inside a property** (not a free-text "portion" on the lease, and not dropping the overlap check):
   it shows which units are vacant and stops a unit being rented twice.
2. **Status stays Rented** when any unit is rented, with occupancy ("2 of 3 units rented") shown beside it.
   No "Partly rented" status.
3. **Books stay per property**; rent stays linked to its lease, so each tenant's rent is still visible.

## Approval

- [x] Product owner approves this intent → proceed to `spec.md` review
