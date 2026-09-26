-- Go-live: counting rent from the cut-over date, and opening balances for deposits held and token money.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('90110000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@g.local', 'authenticated', 'authenticated', now());
select set_config('request.jwt.claims', '{"sub":"90110000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Go-live Org')::text, true);
create temp table ids on commit drop as select code as k, id from public.accounts where org_id = current_setting('t.org')::uuid;
insert into public.properties (org_id, code) select current_setting('t.org')::uuid, c from unnest(array['SHOP-4', 'PLOT-9']) c;
insert into ids select code, id from public.properties where org_id = current_setting('t.org')::uuid;
with i as (insert into public.parties (org_id, name) values (current_setting('t.org')::uuid, 'Old Tenant') returning id) insert into ids select 'T', id from i;
with i as (insert into public.parties (org_id, name) values (current_setting('t.org')::uuid, 'Buyer B') returning id) insert into ids select 'B', id from i;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;

-- A lease running since 2020, with the books starting 2026-07-01.
insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
values (current_setting('t.org')::uuid, pg_temp.id('SHOP-4'), pg_temp.id('T'), '2020-01-01', 50000);
insert into ids select 'L', id from public.leases where property_id = pg_temp.id('SHOP-4');

select is((select months_due from public.rent_roll(current_setting('t.org')::uuid, '2026-09-20') where lease_id = pg_temp.id('L')),
          81, 'without "count rent from", every month since 2020 is due');
update public.leases set rent_counted_from = '2026-07-01' where id = pg_temp.id('L');
select is((select row(months_due, arrears, rent_counted_from)::text from public.rent_roll(current_setting('t.org')::uuid, '2026-09-20') where lease_id = pg_temp.id('L')),
          '(3,150000.00,2026-07-01)', 'counted from the cut-over: Jul-Sep due');
-- Rent entered without a lease before the cut-over is not counted; after it, it is.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'rent', 'date', '2026-06-05', 'property_id', pg_temp.id('SHOP-4'), 'party_id', pg_temp.id('T'), 'amount', '50000.00', 'account_id', pg_temp.id('1000')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'rent', 'date', '2026-07-05', 'property_id', pg_temp.id('SHOP-4'), 'party_id', pg_temp.id('T'), 'amount', '50000.00', 'account_id', pg_temp.id('1000')));
select is((select row(received, months_unpaid)::text from public.rent_roll(current_setting('t.org')::uuid, '2026-09-20') where lease_id = pg_temp.id('L')),
          '(50000.00,2)', 'only rent from the counted date onwards is set against the dues');
-- Arrears known at cut-over: count from two months earlier.
update public.leases set rent_counted_from = '2026-05-01' where id = pg_temp.id('L');
select is((select months_due from public.rent_roll(current_setting('t.org')::uuid, '2026-09-20') where lease_id = pg_temp.id('L')),
          5, 'counting from earlier carries the known arrears (May-Sep due)');
select throws_ok(format($$update public.leases set rent_counted_from = '2019-12-01' where id = %L$$, pg_temp.id('L')),
  '23514', null, 'cannot count rent from before the lease starts');

-- Opening balances with a deposit held and token money received.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'opening', 'date', '2026-06-30', 'lines', jsonb_build_array(
  jsonb_build_object('account_id', pg_temp.id('1000'), 'debit', '1000000.00'),
  jsonb_build_object('account_id', pg_temp.id('1200'), 'debit', '5000000.00', 'property_id', pg_temp.id('PLOT-9')),
  jsonb_build_object('account_id', pg_temp.id('1200'), 'debit', '3000000.00', 'property_id', pg_temp.id('SHOP-4')),
  jsonb_build_object('account_id', pg_temp.id('2200'), 'credit', '100000.00', 'property_id', pg_temp.id('SHOP-4'), 'party_id', pg_temp.id('T')),
  jsonb_build_object('account_id', pg_temp.id('2100'), 'credit', '500000.00', 'property_id', pg_temp.id('PLOT-9'), 'party_id', pg_temp.id('B')))));

select is((select deposits from public.party_balances(current_setting('t.org')::uuid) where name = 'Old Tenant'), 100000.00::numeric(18, 2), 'deposit held for the tenant');
select is((select deposit_held from public.rent_roll(current_setting('t.org')::uuid, '2026-09-20') where lease_id = pg_temp.id('L')),
          100000.00::numeric(18, 2), 'the rent roll shows the opening deposit on the lease');
select is((select advances from public.party_balances(current_setting('t.org')::uuid) where name = 'Buyer B'), 500000.00::numeric(18, 2), 'token money owed back to the buyer');
select is(public.property_status(current_setting('t.org')::uuid, pg_temp.id('PLOT-9')), 'under_agreement'::public.property_status, 'opening token money puts the plot under agreement');

-- The sale applies the opening advance.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'sale', 'date', '2026-08-01', 'property_id', pg_temp.id('PLOT-9'), 'party_id', pg_temp.id('B'),
  'price', '6000000.00', 'received_now', '5500000.00', 'account_id', pg_temp.id('1000')));
select is((select row(advances, receivable)::text from public.party_balances(current_setting('t.org')::uuid) where name = 'Buyer B'), '(0.00,0.00)', 'the sale used the opening advance: nothing left either way');
select is((select net_profit from public.property_summary(current_setting('t.org')::uuid, pg_temp.id('PLOT-9'))), 1000000.00::numeric(18, 2), 'profit on the plot = price - opening cost');

select ok(has_function_privilege('anon', 'public.ping()', 'execute') and not has_table_privilege('anon', 'public.organizations', 'select'),
          'keep-alive: anon may ping, but still reads no table');
select is((select sum(debit) - sum(credit) from public.trial_balance(current_setting('t.org')::uuid)), 0.00::numeric, 'trial balance is zero');

select * from finish();
rollback;
