-- Units (spec 006): several tenants in one property. Lease rules per unit, occupancy, rent counted once,
-- unit in the read models, isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('0e170000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@u.local', 'authenticated', 'authenticated', now()),
  ('0e170000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'x@u.local', 'authenticated', 'authenticated', now()),
  ('0e170000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'v@u.local', 'authenticated', 'authenticated', now());

-- Owner of org A.
select set_config('request.jwt.claims', '{"sub":"0e170000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Units Org')::text, true);
insert into public.memberships (org_id, user_id, role) values (current_setting('t.org')::uuid, '0e170000-0000-0000-0000-000000000003', 'viewer');
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);
insert into public.properties (org_id, code)
select current_setting('t.org')::uuid, c
from unnest(array['H-10', 'H-20', 'H-30', 'PLAIN', 'SHOPS', 'DUO', 'STAT', 'WH', 'EXP']) c;
create temp table ids on commit drop as
  select code as k, id from public.properties where org_id = current_setting('t.org')::uuid;
with p as (
  insert into public.parties (org_id, name)
  select current_setting('t.org')::uuid, n from unnest(array['Tenant A', 'Tenant B', 'Tenant C']) n
  returning name, id
)
insert into ids select name, id from p;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;
create function pg_temp.today() returns date language sql as $$ select public.org_today(current_setting('t.org')::uuid) $$;
create function pg_temp.post(p jsonb) returns jsonb language sql as $$
  select public.post_voucher(current_setting('t.org')::uuid, p || jsonb_build_object('account_id', current_setting('t.cash')))
$$;
-- Adds a unit and remembers it under its key.
create function pg_temp.unit(k text, prop text, uname text) returns uuid language sql as $$
  with u as (
    insert into public.property_units (org_id, property_id, name)
    values (current_setting('t.org')::uuid, pg_temp.id(prop), uname) returning id
  )
  insert into ids select k, u.id from u returning id
$$;
-- Adds a lease (unit key or null for the whole property) and remembers it under its key.
create function pg_temp.lease(k text, prop text, unit text, party text, s date, e date, rent numeric default 50000)
returns uuid language sql as $$
  with l as (
    insert into public.leases (org_id, property_id, unit_id, party_id, start_date, end_date, monthly_rent)
    values (current_setting('t.org')::uuid, pg_temp.id(prop), pg_temp.id(unit), pg_temp.id(party), s, e, rent)
    returning id
  )
  insert into ids select k, l.id from l returning id
$$;

select pg_temp.post('{"type":"capital","date":"2026-01-01","amount":"10000000.00"}');

-- Units -----------------------------------------------------------------------------------------------
select lives_ok($$select pg_temp.unit('GF', 'H-10', 'Ground floor'), pg_temp.unit('1F', 'H-10', '1st floor')$$,
  'owner adds two units to a property');
select throws_ok(format($$insert into public.property_units (org_id, property_id, name) values (%L, %L, ' ground FLOOR ')$$,
  current_setting('t.org'), pg_temp.id('H-10')),
  '23505', null, 'unit names are unique in a property, ignoring case and outer spaces');
select lives_ok($$select pg_temp.unit('H20-GF', 'H-20', 'Ground floor')$$, 'the same name on another property is fine');
select throws_ok(format($$insert into public.property_units (org_id, property_id, name) values (%L, %L, '   ')$$,
  current_setting('t.org'), pg_temp.id('H-10')),
  '23514', null, 'a blank unit name is refused');
select lives_ok(format($$update public.property_units set name = 'First floor', notes = 'Two rooms' where id = %L$$, pg_temp.id('1F')),
  'a unit can be renamed and noted');
select throws_ok(format($$update public.property_units set property_id = %L where id = %L$$, pg_temp.id('H-20'), pg_temp.id('1F')),
  '42501', null, 'a unit never moves to another property');

-- Lease rules (spec §4) -----------------------------------------------------------------------------
select lives_ok($$select pg_temp.lease('L-GF', 'H-10', 'GF', 'Tenant A', '2026-10-02', '2027-06-30')$$,
  'ground floor leased to tenant A');
select lives_ok($$select pg_temp.lease('L-1F', 'H-10', '1F', 'Tenant B', '2026-10-02', '2027-06-30')$$,
  'first floor leased to tenant B for the same dates');
select throws_like($$select pg_temp.lease('X', 'H-10', 'GF', 'Tenant C', '2027-01-01', null)$$,
  'this unit already has a lease for these dates', 'a second lease on the same unit is refused');
select throws_like($$select pg_temp.lease('X', 'H-10', null, 'Tenant C', '2027-06-30', '2027-12-31')$$,
  'a unit of this property is rented for these dates', 'a whole-property lease overlapping a unit lease is refused (last day counts)');

-- A property without units: today's rule and message, unchanged.
select lives_ok($$select pg_temp.lease('L-PLAIN', 'PLAIN', null, 'Tenant A', '2026-01-01', null)$$, 'whole-property lease on a property without units');
select throws_like($$select pg_temp.lease('X', 'PLAIN', null, 'Tenant B', '2026-06-01', null)$$,
  'this property already has a lease for these dates', 'without units, an overlapping lease is refused with today''s message');

-- Whole property first, then units.
select pg_temp.unit('U1', 'H-30', 'Unit 1');
select pg_temp.unit('U2', 'H-30', 'Unit 2');
select pg_temp.lease('L-H30-WHOLE', 'H-30', null, 'Tenant A', '2026-01-01', '2026-03-31');
select throws_like($$select pg_temp.lease('X', 'H-30', 'U1', 'Tenant B', '2026-03-31', null)$$,
  'the whole property is rented for these dates', 'a unit lease overlapping a whole-property lease is refused');
select lives_ok($$select pg_temp.lease('L-U1', 'H-30', 'U1', 'Tenant B', '2026-04-01', null)$$,
  'a unit lease starting the day after the whole-property lease ends is allowed');

-- The unit must belong to the lease's property.
select throws_ok(format($$insert into public.leases (org_id, property_id, unit_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, %L, '2030-01-01', 1000)$$, current_setting('t.org'), pg_temp.id('H-10'), pg_temp.id('H20-GF'), pg_temp.id('Tenant C')),
  '23503', null, 'a lease cannot point at a unit of another property');
select throws_ok(format($$update public.leases set property_id = %L where id = %L$$, pg_temp.id('H-20'), pg_temp.id('L-1F')),
  '23503', null, 'a lease cannot move to another property while it keeps its unit');

-- Deleting units.
select throws_ok(format($$delete from public.property_units where id = %L$$, pg_temp.id('GF')),
  '23503', null, 'a unit with a lease cannot be deleted');
select is((select count(*)::int from public.property_units where id = pg_temp.id('GF')), 1, 'the unit is still there');
select lives_ok(format($$delete from public.property_units where id = %L$$, pg_temp.id('H20-GF')),
  'a unit that never had a lease can be deleted');

-- A lease with entries can move to another unit of its property; its property and tenant stay fixed.
select pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-04-05', 'lease_id', pg_temp.id('L-U1'), 'amount', '50000.00'));
select lives_ok(format($$update public.leases set unit_id = %L where id = %L$$, pg_temp.id('U2'), pg_temp.id('L-U1')),
  'a lease with entries can move to another unit');
select throws_like(format($$update public.leases set party_id = %L where id = %L$$, pg_temp.id('Tenant C'), pg_temp.id('L-U1')),
  '%cannot change%', 'its tenant still cannot change');
select throws_like(format($$update public.leases set property_id = %L, unit_id = null where id = %L$$, pg_temp.id('H-20'), pg_temp.id('L-U1')),
  '%cannot change%', 'nor its property, even with the unit cleared');

-- Deleting a property removes its unused units with it.
insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'GONE');
insert into ids select 'GONE', id from public.properties where org_id = current_setting('t.org')::uuid and code = 'GONE';
select pg_temp.unit('GONE-1', 'GONE', 'Unit 1');
select lives_ok(format($$delete from public.properties where id = %L$$, pg_temp.id('GONE')), 'a property with unused units can be deleted');
select is((select count(*)::int from public.property_units where id = pg_temp.id('GONE-1')), 0, 'its units go with it');

-- Occupancy and status, as at the organization's today (spec §6) ---------------------------------------
select pg_temp.unit('S1', 'STAT', 'S1'); select pg_temp.unit('S2', 'STAT', 'S2'); select pg_temp.unit('S3', 'STAT', 'S3');
select pg_temp.lease('L-S1', 'STAT', 'S1', 'Tenant A', pg_temp.today() - 30, null);
select pg_temp.lease('L-S2', 'STAT', 'S2', 'Tenant B', pg_temp.today() - 60, pg_temp.today() - 1);
select is((select string_agg(name || ':' || state, ',' order by name) from public.property_units_overview where property_id = pg_temp.id('STAT')),
          'S1:rented,S2:vacant,S3:vacant', 'unit states: one rented, one ended, one never let');
select is((select row(status, units_total, units_vacant)::text from public.properties_overview where id = pg_temp.id('STAT')),
          '(rented,3,2)', 'one of three units let: Rented, 1 of 3');
select is((select row(tenant_name, lease_id)::text from public.property_units_overview where id = pg_temp.id('S1')),
          row('Tenant A', pg_temp.id('L-S1'))::text, 'a rented unit names its tenant and lease');
update public.leases set ended_on = pg_temp.today() - 1 where id = pg_temp.id('L-S1');
select is((select row(status, units_total, units_vacant)::text from public.properties_overview where id = pg_temp.id('STAT')),
          '(vacant,3,3)', 'every unit lease ended: Vacant, 0 of 3');

select pg_temp.unit('W1', 'WH', 'W1'); select pg_temp.unit('W2', 'WH', 'W2');
select lives_ok($$select pg_temp.lease('L-WH', 'WH', null, 'Tenant C', pg_temp.today() - 5, null)$$,
  'a whole-property lease on a property with units (no unit let at the time)');
select is((select string_agg(state || ':' || tenant_name, ',' order by name) from public.property_units_overview where property_id = pg_temp.id('WH')),
          'whole_property:Tenant C,whole_property:Tenant C', 'its units show as part of the whole-property lease');
select is((select row(status, units_total, units_vacant)::text from public.properties_overview where id = pg_temp.id('WH')),
          '(rented,2,0)', 'whole property let: Rented, 2 of 2');
select is((select row(units_total, units_vacant)::text from public.properties_overview where id = pg_temp.id('PLAIN')),
          '(0,0)', 'a property without units has no occupancy');
select is((select lease_count from public.property_units_overview where id = pg_temp.id('GF')), 1, 'lease count per unit');

-- Rent roll and leases ending show the unit -----------------------------------------------------------
-- 1F was renamed "First floor": the rent roll reads the current name.
select is((select string_agg(unit_name || ':' || tenant_name, ',' order by unit_name) from public.rent_roll(current_setting('t.org')::uuid, '2026-11-01') where property_code = 'H-10'),
          'First floor:Tenant B,Ground floor:Tenant A', 'rent roll rows carry the unit''s current name');
select pg_temp.unit('E1', 'EXP', 'E1');
select pg_temp.lease('L-E1', 'EXP', 'E1', 'Tenant A', pg_temp.today() - 10, pg_temp.today() + 20);
select is((select unit_name || ':' || days_to_end from public.expiring_leases(current_setting('t.org')::uuid) where property_code = 'EXP'),
          'E1:20', 'leases ending soon carry the unit');

-- Rent never counted twice (spec §5) ------------------------------------------------------------------
-- Tenant C rents Shop 1 from January and pays February without choosing the lease. Shop 2 is then added,
-- backdated to February 1st: the old payment counts towards Shop 1 only.
select pg_temp.unit('SH1', 'SHOPS', 'Shop 1'); select pg_temp.unit('SH2', 'SHOPS', 'Shop 2');
select pg_temp.lease('L-SH1', 'SHOPS', 'SH1', 'Tenant C', '2026-01-01', null, 50000);
insert into ids select 'R-FEB', (pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-02-05',
  'property_id', pg_temp.id('SHOPS'), 'party_id', pg_temp.id('Tenant C'), 'amount', '50000.00')) ->> 'id')::uuid;
select lives_ok($$select pg_temp.lease('L-SH2', 'SHOPS', 'SH2', 'Tenant C', '2026-02-01', null, 30000)$$,
  'the same tenant rents a second unit at the same time');
select is((select sum(received) from public.rent_roll(current_setting('t.org')::uuid, '2026-02-20') where property_code = 'SHOPS'),
          50000.00::numeric, 'a payment with no lease is counted once across the tenant''s leases');
select is((select string_agg(unit_name || ':' || received, ',' order by unit_name) from public.rent_roll(current_setting('t.org')::uuid, '2026-02-20') where property_code = 'SHOPS'),
          'Shop 1:50000.00,Shop 2:0.00', 'it counts towards the lease that started first');

-- From now on the lease must be chosen while both are active.
select throws_like(format($$select pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-03-05',
  'property_id', %L, 'party_id', %L, 'amount', '30000.00'))$$, pg_temp.id('SHOPS'), pg_temp.id('Tenant C')),
  '%more than one lease on this property on that date%', 'ambiguous rent with no lease is refused');
select throws_like(format($$select public.preview_voucher(%L, jsonb_build_object('type', 'rent', 'date', '2026-03-05',
  'property_id', %L, 'party_id', %L, 'amount', '30000.00', 'account_id', %L))$$,
  current_setting('t.org'), pg_temp.id('SHOPS'), pg_temp.id('Tenant C'), current_setting('t.cash')),
  '%more than one lease on this property on that date%', 'the preview shows the same error');
select throws_like(format($$select pg_temp.post(jsonb_build_object('type', 'deposit', 'date', '2026-03-05',
  'property_id', %L, 'party_id', %L, 'amount', '30000.00'))$$, pg_temp.id('SHOPS'), pg_temp.id('Tenant C')),
  '%more than one lease on this property on that date%', 'an ambiguous deposit with no lease is refused too');
select lives_ok(format($$select pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-03-05',
  'lease_id', %L, 'amount', '30000.00'))$$, pg_temp.id('L-SH2')),
  'with the lease chosen, the rent is accepted');
select is((select string_agg(unit_name || ':' || received, ',' order by unit_name) from public.rent_roll(current_setting('t.org')::uuid, '2026-03-20') where property_code = 'SHOPS'),
          'Shop 1:50000.00,Shop 2:30000.00', 'and counts towards that lease only');
select lives_ok(format($$select public.reverse_voucher(%L, 'wrong tenant')$$, pg_temp.id('R-FEB')),
  'an older entry with no lease can still be voided');
select is((select sum(received) from public.rent_roll(current_setting('t.org')::uuid, '2026-03-20') where property_code = 'SHOPS'),
          30000.00::numeric, 'the voided payment stops counting');

-- Two different tenants on two units: the tenant decides, no refusal.
select pg_temp.unit('D1', 'DUO', 'D1'); select pg_temp.unit('D2', 'DUO', 'D2');
select pg_temp.lease('L-D1', 'DUO', 'D1', 'Tenant A', '2026-01-01', null, 40000);
select pg_temp.lease('L-D2', 'DUO', 'D2', 'Tenant B', '2026-01-01', null, 45000);
select lives_ok(format($$select pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-01-05',
  'property_id', %L, 'party_id', %L, 'amount', '40000.00'))$$, pg_temp.id('DUO'), pg_temp.id('Tenant A')),
  'rent with no lease from one of two tenants is accepted');
select is((select string_agg(unit_name || ':' || received, ',' order by unit_name) from public.rent_roll(current_setting('t.org')::uuid, '2026-01-20') where property_code = 'DUO'),
          'D1:40000.00,D2:0.00', 'it counts towards that tenant''s lease');

-- Books unchanged: rent of both units sits on the property; the trial balance stays zero.
select is((select sum(credit - debit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id
           where jl.property_id = pg_temp.id('SHOPS') and a.system_key = 'rent_income'), 30000.00::numeric,
          'the property''s rent income in the ledger agrees with the rent roll');
select is((select sum(debit) - sum(credit) from public.trial_balance(current_setting('t.org')::uuid)), 0.00::numeric, 'trial balance is zero');

-- Documents name the lease's unit.
insert into ids values ('DOC', gen_random_uuid());
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('documents', current_setting('t.org') || '/' || pg_temp.id('DOC') || '/agreement.pdf', auth.uid()::text,
        '{"size":1234,"mimetype":"application/pdf"}');
select public.add_document(current_setting('t.org')::uuid, pg_temp.id('DOC'), current_setting('t.org') || '/' || pg_temp.id('DOC') || '/agreement.pdf',
                           'rent_agreement', 'Agreement', jsonb_build_object('lease_id', pg_temp.id('L-GF')));
select is((select record_label from public.documents_overview where id = pg_temp.id('DOC')),
          'H-10 · Ground floor · Tenant A', 'a lease document''s label names the unit');

-- Viewer: reads, cannot write ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0e170000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select isnt_empty(format('select 1 from public.property_units_overview where org_id = %L', current_setting('t.org')), 'viewer sees units');
select throws_ok(format($$insert into public.property_units (org_id, property_id, name) values (%L, %L, 'Shop 9')$$,
  current_setting('t.org'), pg_temp.id('SHOPS')),
  '42501', null, 'viewer cannot add a unit');
select is_empty(format($$with u as (update public.property_units set name = 'x' where org_id = %L returning 1) select * from u$$, current_setting('t.org')),
  'viewer cannot rename units');
select is_empty(format($$with d as (delete from public.property_units where id = %L returning 1) select * from d$$, pg_temp.id('S3')),
  'viewer cannot delete units');

-- Outsider (own org B) ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0e170000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('t.org_b', public.create_organization('Other Org')::text, true);
select is_empty(format('select 1 from public.property_units where org_id = %L', current_setting('t.org')), 'outsider sees no units');
select is_empty(format('select 1 from public.property_units_overview where org_id = %L', current_setting('t.org')), 'outsider sees no unit states');
select throws_ok(format($$insert into public.property_units (org_id, property_id, name) values (%L, %L, 'Shop 9')$$,
  current_setting('t.org'), pg_temp.id('SHOPS')),
  '42501', null, 'outsider cannot add a unit to org A');
select is_empty(format($$with u as (update public.property_units set name = 'x' where org_id = %L returning 1) select * from u$$, current_setting('t.org')),
  'outsider cannot rename org A units');
select is_empty(format($$with d as (delete from public.property_units where org_id = %L returning 1) select * from d$$, current_setting('t.org')),
  'outsider cannot delete org A units');
with p as (insert into public.properties (org_id, code) values (current_setting('t.org_b')::uuid, 'B-1') returning id)
select set_config('t.prop_b', (select id::text from p), true);
with i as (insert into public.parties (org_id, name) values (current_setting('t.org_b')::uuid, 'B tenant') returning id)
select set_config('t.party_b', (select id::text from i), true);
select throws_ok(format($$insert into public.leases (org_id, property_id, unit_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, %L, '2030-01-01', 1000)$$, current_setting('t.org_b'), current_setting('t.prop_b'), pg_temp.id('S3'), current_setting('t.party_b')),
  '23503', null, 'a lease cannot point at another organization''s unit');

select * from finish();
rollback;
