-- Leases: rules, derived RENTED/VACANT status, rent roll (months unpaid), expiring leases, isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('1eae0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@l.local', 'authenticated', 'authenticated', now()),
  ('1eae0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'x@l.local', 'authenticated', 'authenticated', now()),
  ('1eae0000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'v@l.local', 'authenticated', 'authenticated', now());

-- Owner of org A.
select set_config('request.jwt.claims', '{"sub":"1eae0000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Lease Org')::text, true);
insert into public.memberships (org_id, user_id, role) values (current_setting('t.org')::uuid, '1eae0000-0000-0000-0000-000000000003', 'viewer');
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);
insert into public.properties (org_id, code) select current_setting('t.org')::uuid, c from unnest(array['SHOP-4', 'DP-25', 'SOLD-1', 'FLAT-7', 'MID-1', 'REN-1']) c;
create temp table ids on commit drop as
  select code as k, id from public.properties where org_id = current_setting('t.org')::uuid;
with i as (insert into public.parties (org_id, name) values (current_setting('t.org')::uuid, 'Tenant X') returning id)
insert into ids select 'TX', id from i;
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Tenant Y', '{tenant}') returning id)
insert into ids select 'TY', id from i;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;
create function pg_temp.post(p jsonb) returns jsonb language sql as $$
  select public.post_voucher(current_setting('t.org')::uuid, p || jsonb_build_object('account_id', current_setting('t.cash')))
$$;

select pg_temp.post('{"type":"capital","date":"2026-01-01","amount":"10000000.00"}');

-- Rules ----------------------------------------------------------------------------------------------
select lives_ok(format($$insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, '2026-01-01', 50000)$$, current_setting('t.org'), pg_temp.id('SHOP-4'), pg_temp.id('TX')),
  'owner creates a lease');
insert into ids select 'L1', id from public.leases where property_id = pg_temp.id('SHOP-4');
select ok((select 'tenant' = any (roles) from public.parties where id = pg_temp.id('TX')), 'the party becomes a tenant');
select throws_like(format($$insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, '2026-06-01', 60000)$$, current_setting('t.org'), pg_temp.id('SHOP-4'), pg_temp.id('TY')),
  '%already has a lease%', 'overlapping lease on the same property is rejected');

-- Rent: one against the lease, one entered without a lease (same property + tenant) -------------------
select pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-01-05', 'lease_id', pg_temp.id('L1'), 'amount', '50000.00', 'period', '2026-01'));
select pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-02-05', 'property_id', pg_temp.id('SHOP-4'), 'party_id', pg_temp.id('TX'), 'amount', '50000.00'));

select is((select row(months_due, received, arrears, months_unpaid)::text from public.rent_roll(current_setting('t.org')::uuid, '2026-03-20') where lease_id = pg_temp.id('L1')),
          '(3,100000.00,50000.00,1)', 'Jan-Mar due, 2 paid (one without lease): 1 month / 50,000 unpaid');
select is((select last_rent_date from public.rent_roll(current_setting('t.org')::uuid, '2026-03-20') where lease_id = pg_temp.id('L1')),
          '2026-02-05'::date, 'last rent received date');
select is((select months_due from public.rent_roll(current_setting('t.org')::uuid, '2025-12-31') where lease_id = pg_temp.id('L1')),
          0, 'nothing is due before the lease starts');

-- A voided rent stops counting; a corrected rent keeps its lease and counts at the new amount.
select public.reverse_voucher((pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-03-06', 'lease_id', pg_temp.id('L1'), 'amount', '50000.00')) ->> 'id')::uuid, 'wrong');
select is((select received from public.rent_roll(current_setting('t.org')::uuid, '2026-03-20') where lease_id = pg_temp.id('L1')),
          100000.00::numeric(18, 2), 'voided rent is not counted');
select is((select last_rent_date from public.rent_roll(current_setting('t.org')::uuid, '2026-03-20') where lease_id = pg_temp.id('L1')),
          '2026-02-05'::date, 'voided rent is not the last rent');

insert into ids select 'R1', id from public.vouchers where lease_id = pg_temp.id('L1') and date = '2026-01-05';
insert into ids select 'R1b', (public.edit_voucher(pg_temp.id('R1'), '{"amount":"55000.00"}') ->> 'id')::uuid;
select is((select lease_id from public.vouchers where id = pg_temp.id('R1b')), pg_temp.id('L1'), 'a correction keeps the lease');
select is((select row(received, paid_ahead, arrears, months_unpaid)::text from public.rent_roll(current_setting('t.org')::uuid, '2026-02-20') where lease_id = pg_temp.id('L1')),
          '(105000.00,5000.00,0.00,0)', 'corrected to 55,000: 5,000 paid ahead in February');
select is((select sum(credit - debit) from public.journal_lines jl join public.accounts a on a.id = jl.account_id
           where jl.property_id = pg_temp.id('SHOP-4') and a.system_key = 'rent_income'), 105000.00::numeric, 'ledger agrees with the rent roll');

-- Deposit held for the lease.
select pg_temp.post(jsonb_build_object('type', 'deposit', 'date', '2026-01-01', 'lease_id', pg_temp.id('L1'), 'amount', '100000.00'));
select pg_temp.post(jsonb_build_object('type', 'deposit', 'date', '2026-04-30', 'lease_id', pg_temp.id('L1'), 'amount', '20000.00', 'direction', 'refunded'));
select is((select deposit_held from public.rent_roll(current_setting('t.org')::uuid, '2026-05-01') where lease_id = pg_temp.id('L1')),
          80000.00::numeric(18, 2), 'deposit held = received - refunded');

-- Ending the lease: dues stop at the end, status becomes ended, a back-to-back lease is allowed.
update public.leases set ended_on = '2026-04-30' where id = pg_temp.id('L1');
select is((select row(status, months_due)::text from public.rent_roll(current_setting('t.org')::uuid, '2026-06-01') where lease_id = pg_temp.id('L1')),
          '(ended,4)', 'ended lease: Jan-Apr due, nothing after');
select lives_ok(format($$insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, '2026-05-01', 60000)$$, current_setting('t.org'), pg_temp.id('SHOP-4'), pg_temp.id('TY')),
  'a back-to-back lease after the end is allowed');
select throws_like(format($$update public.leases set property_id = %L where id = %L$$, pg_temp.id('FLAT-7'), pg_temp.id('L1')),
  '%cannot change%', 'a lease with entries keeps its property');
select throws_ok(format($$delete from public.leases where id = %L$$, pg_temp.id('L1')),
  '23503', null, 'a lease with entries cannot be deleted');

-- Due day in mid-month.
insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent, rent_due_day)
values (current_setting('t.org')::uuid, pg_temp.id('MID-1'), pg_temp.id('TY'), '2026-01-15', 1000, 15);
select is((select months_due from public.rent_roll(current_setting('t.org')::uuid, '2026-02-14') where property_code = 'MID-1'), 1, 'due on the 15th: one month due on Feb 14');
select is((select months_due from public.rent_roll(current_setting('t.org')::uuid, '2026-02-15') where property_code = 'MID-1'), 2, 'second month due on Feb 15');
update public.leases set rent_due_day = 1 where property_id = pg_temp.id('MID-1');
select is((select months_due from public.rent_roll(current_setting('t.org')::uuid, '2026-02-01') where property_code = 'MID-1'), 1, 'start Jan 15, due on the 1st: first due Feb 1');

-- Renewal with the same tenant: a deposit entered without a lease is counted once, on the lease it was paid for.
insert into public.leases (org_id, property_id, party_id, start_date, ended_on, monthly_rent)
values (current_setting('t.org')::uuid, pg_temp.id('REN-1'), pg_temp.id('TY'), '2025-01-01', '2025-12-31', 1000),
       (current_setting('t.org')::uuid, pg_temp.id('REN-1'), pg_temp.id('TY'), '2026-01-01', null, 1100);
select pg_temp.post(jsonb_build_object('type', 'deposit', 'date', '2025-01-01', 'property_id', pg_temp.id('REN-1'), 'party_id', pg_temp.id('TY'), 'amount', '2000.00'));
select is((select sum(deposit_held) from public.rent_roll(current_setting('t.org')::uuid, '2026-06-01') where property_code = 'REN-1'),
          2000.00::numeric, 'renewal: the deposit is held once across both leases');
select is((select deposit_held from public.rent_roll(current_setting('t.org')::uuid, '2026-06-01') where property_code = 'REN-1' and start_date = '2025-01-01'),
          2000.00::numeric(18, 2), 'the deposit sits on the lease it was paid for');

-- Status is derived from leases against the organization's today ---------------------------------------
select is(public.property_status(current_setting('t.org')::uuid, pg_temp.id('DP-25')), 'vacant'::public.property_status, 'no lease: vacant');
insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
values (current_setting('t.org')::uuid, pg_temp.id('DP-25'), pg_temp.id('TY'), public.org_today(current_setting('t.org')::uuid) - 30, 80000);
select is(public.property_status(current_setting('t.org')::uuid, pg_temp.id('DP-25')), 'rented'::public.property_status, 'active lease: rented');
update public.leases set ended_on = public.org_today(current_setting('t.org')::uuid) - 1 where property_id = pg_temp.id('DP-25');
select is(public.property_status(current_setting('t.org')::uuid, pg_temp.id('DP-25')), 'vacant'::public.property_status, 'lease ended: vacant again');
insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
values (current_setting('t.org')::uuid, pg_temp.id('DP-25'), pg_temp.id('TY'), public.org_today(current_setting('t.org')::uuid) + 10, 90000);
select is(public.property_status(current_setting('t.org')::uuid, pg_temp.id('DP-25')), 'vacant'::public.property_status, 'future lease: still vacant');
select is((select string_agg(status, ',' order by start_date) from public.rent_roll(current_setting('t.org')::uuid) where property_code = 'DP-25'),
          'ended,upcoming', 'rent roll shows the ended and the upcoming lease');

-- Expiring leases.
insert into public.leases (org_id, property_id, party_id, start_date, end_date, monthly_rent)
values (current_setting('t.org')::uuid, pg_temp.id('FLAT-7'), pg_temp.id('TY'), '2026-01-01', public.org_today(current_setting('t.org')::uuid) + 20, 30000);
select is((select string_agg(property_code || ':' || days_to_end, ',') from public.expiring_leases(current_setting('t.org')::uuid)),
          'FLAT-7:20', 'only the lease ending within 60 days is expiring');
select is_empty(format('select 1 from public.expiring_leases(%L, 10)', current_setting('t.org')), 'nothing ends within 10 days');

-- Sold property cannot be rented.
select pg_temp.post(jsonb_build_object('type', 'purchase', 'date', '2026-01-02', 'property_id', pg_temp.id('SOLD-1'), 'price', '1000.00', 'paid_now', '1000.00'));
select pg_temp.post(jsonb_build_object('type', 'sale', 'date', '2026-01-03', 'property_id', pg_temp.id('SOLD-1'), 'party_id', pg_temp.id('TY'), 'price', '1500.00', 'received_now', '1500.00'));
select throws_like(format($$insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, '2026-02-01', 1000)$$, current_setting('t.org'), pg_temp.id('SOLD-1'), pg_temp.id('TY')),
  '%sold%', 'a sold property cannot be leased');

-- Books still balance.
select is((select sum(debit) - sum(credit) from public.trial_balance(current_setting('t.org')::uuid)), 0.00::numeric, 'trial balance is zero');

-- Viewer: reads, cannot write -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"1eae0000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select isnt_empty(format('select 1 from public.rent_roll(%L)', current_setting('t.org')), 'viewer sees the rent roll');
select throws_ok(format($$insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, '2030-01-01', 1000)$$, current_setting('t.org'), pg_temp.id('FLAT-7'), pg_temp.id('TY')),
  '42501', null, 'viewer cannot create a lease');

-- Outsider (own org B) ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"1eae0000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('t.org_b', public.create_organization('Other Org')::text, true);
select is_empty(format('select 1 from public.leases where org_id = %L', current_setting('t.org')), 'outsider sees no leases');
select is_empty(format('select 1 from public.rent_roll(%L)', current_setting('t.org')), 'outsider gets no rent roll');
select throws_ok(format($$insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, '2030-01-01', 1000)$$, current_setting('t.org'), pg_temp.id('FLAT-7'), pg_temp.id('TY')),
  '42501', null, 'outsider cannot insert a lease into org A');
select is_empty(format($$with u as (update public.leases set monthly_rent = 1 where org_id = %L returning 1) select * from u$$, current_setting('t.org')),
  'outsider cannot update org A leases');
select is_empty(format($$with d as (delete from public.leases where org_id = %L returning 1) select * from d$$, current_setting('t.org')),
  'outsider cannot delete org A leases');
with i as (insert into public.parties (org_id, name) values (current_setting('t.org_b')::uuid, 'B tenant') returning id)
select set_config('t.party_b', (select id::text from i), true);
select throws_ok(format($$insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
  values (%L, %L, %L, '2030-01-01', 1000)$$, current_setting('t.org_b'), pg_temp.id('FLAT-7'), current_setting('t.party_b')),
  '23503', null, 'a lease cannot point at another organization''s property');

select * from finish();
rollback;
