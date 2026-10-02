-- Spec 006 (U1): units, the parts of a property that are rented separately ("Ground floor", "Shop 3").
-- Units are master data, written straight to the table under RLS like properties and leases. They never
-- touch the books: purchase, costs, rent and the sale stay on the property.
-- Skills: .claude/skills/tenant-isolation (new table: org_id, RLS, composite FKs, cross-org pgTAP)

create table public.property_units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  name text not null check (btrim(name) <> '' and length(btrim(name)) <= 60),
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, property_id, id),
  foreign key (org_id, property_id) references public.properties (org_id, id) on delete cascade
);
-- No two units of one property share a name, ignoring case and spaces at the ends.
create unique index property_units_name_idx on public.property_units (org_id, property_id, lower(btrim(name)));

alter table public.property_units enable row level security;
create policy property_units_select on public.property_units for select to authenticated
  using (public.is_member(org_id));
create policy property_units_insert on public.property_units for insert to authenticated
  with check (public.has_role(org_id, '{owner,accountant}'));
create policy property_units_update on public.property_units for update to authenticated
  using (public.has_role(org_id, '{owner,accountant}')) with check (public.has_role(org_id, '{owner,accountant}'));
create policy property_units_delete on public.property_units for delete to authenticated
  using (public.has_role(org_id, '{owner,accountant}'));

-- A unit never moves to another property or organization: only its name and note can be changed.
revoke all on public.property_units from anon, authenticated;
grant select, insert, delete on public.property_units to authenticated;
grant update (name, notes) on public.property_units to authenticated;

-- A lease is for one unit, or for the whole property (unit_id null: every existing lease).
-- The three-column FK keeps the unit on the lease's own property and organization (a null unit_id skips it).
-- No action (not restrict) on delete, so deleting an organization can still cascade through both tables;
-- deleting a unit that has leases is refused either way.
alter table public.leases add column unit_id uuid;
alter table public.leases add constraint leases_unit_fkey
  foreign key (org_id, property_id, unit_id) references public.property_units (org_id, property_id, id);
create index leases_unit_idx on public.leases (org_id, unit_id) where unit_id is not null;
