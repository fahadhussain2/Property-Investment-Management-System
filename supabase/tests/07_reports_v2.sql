-- Party balances/statement and property build-up reconcile with the rest of the books.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('abababab-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@r.local', 'authenticated', 'authenticated', now()),
  ('abababab-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'x@r.local', 'authenticated', 'authenticated', now());

select set_config('request.jwt.claims', '{"sub":"abababab-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Reports Org')::text, true);
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);
with i as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'DP-25') returning id)
select set_config('t.prop', (select id::text from i), true);
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Seller A', '{seller}') returning id)
select set_config('t.seller', (select id::text from i), true);
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Buyer B', '{buyer}') returning id)
select set_config('t.buyer', (select id::text from i), true);

-- Helper-free posting with jsonb_build_object keeps amounts exact.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'capital', 'date', '2026-01-01', 'amount', '5000.00', 'account_id', current_setting('t.cash')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'purchase', 'date', '2026-01-10',
  'property_id', current_setting('t.prop'), 'party_id', current_setting('t.seller'), 'price', '1000.00', 'paid_now', '400.00', 'account_id', current_setting('t.cash')));

select is((select payable from public.party_balances(current_setting('t.org')::uuid) where name = 'Seller A'), 600.00::numeric(18, 2), 'seller is owed the unpaid 600');
select is((select net from public.party_balances(current_setting('t.org')::uuid) where name = 'Seller A'), -600.00::numeric(18, 2), 'net is negative: we owe them');

select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'pay_seller', 'date', '2026-02-01',
  'property_id', current_setting('t.prop'), 'party_id', current_setting('t.seller'), 'amount', '600.00', 'account_id', current_setting('t.cash')));
select is((select net from public.party_balances(current_setting('t.org')::uuid) where name = 'Seller A'), 0.00::numeric(18, 2), 'seller settled after paying the balance');
select is((select count(*)::int from public.party_ledger(current_setting('t.org')::uuid, current_setting('t.seller')::uuid, '2026-01-01', '2026-12-31') where seq > 0),
          2, 'seller statement shows the credit purchase and the payment');
select is((select balance from public.party_ledger(current_setting('t.org')::uuid, current_setting('t.seller')::uuid, '2026-02-01', '2026-12-31') where seq = 0),
          -600.00::numeric(18, 2), 'statement opening balance carries what was owed before the period');

-- Costs: one kept, one voided (must disappear from the build-up).
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'property_cost', 'date', '2026-02-05',
  'property_id', current_setting('t.prop'), 'amount', '200.00', 'memo', 'Transfer fee', 'account_id', current_setting('t.cash')));
select public.reverse_voucher((public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'property_cost', 'date', '2026-02-06',
  'property_id', current_setting('t.prop'), 'amount', '999.00', 'memo', 'Entered twice', 'account_id', current_setting('t.cash'))) ->> 'id')::uuid, 'dup');

select is((select string_agg(label || '=' || amount, ', ' order by label) from public.property_breakdown(current_setting('t.org')::uuid, current_setting('t.prop')::uuid) where section = 'cost'),
          'Purchase price=1000.00, Transfer fee=200.00', 'cost build-up lists purchase and costs; voided cost is gone');
select is((select sum(amount) from public.property_breakdown(current_setting('t.org')::uuid, current_setting('t.prop')::uuid) where section = 'cost'),
          (select cost from public.property_summary(current_setting('t.org')::uuid, current_setting('t.prop')::uuid)), 'cost rows add up to the property cost');

-- Rent, an expense, and the sale with a balance due.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'rent', 'date', '2026-03-01',
  'property_id', current_setting('t.prop'), 'party_id', current_setting('t.buyer'), 'amount', '75.00', 'account_id', current_setting('t.cash')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'expense', 'date', '2026-03-02', 'property_id', current_setting('t.prop'),
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '6000'), 'amount', '25.00', 'account_id', current_setting('t.cash')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'sale', 'date', '2026-04-01',
  'property_id', current_setting('t.prop'), 'party_id', current_setting('t.buyer'), 'price', '1500.00', 'received_now', '1000.00', 'account_id', current_setting('t.cash')));

select is((select receivable from public.party_balances(current_setting('t.org')::uuid) where name = 'Buyer B'), 500.00::numeric(18, 2), 'buyer owes the unpaid 500');
select is((select sum(case section when 'sale' then amount when 'cost_of_sale' then -amount when 'income' then amount when 'expense' then -amount else 0 end)
           from public.property_breakdown(current_setting('t.org')::uuid, current_setting('t.prop')::uuid)),
          (select net_profit from public.property_summary(current_setting('t.org')::uuid, current_setting('t.prop')::uuid)),
          'profit rows add up to the property net profit');
select is((select sum(amount) from public.property_breakdown(current_setting('t.org')::uuid, current_setting('t.prop')::uuid) where section = 'cost'),
          1200.00::numeric, 'cost build-up still shows the full cost after the sale');

-- Regression (M5): a sale dated "tomorrow" by the database's UTC clock (i.e. today in Pakistan
-- after midnight) must still mark the property sold.
with i as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'TZ-1') returning id)
select set_config('t.tz', (select id::text from i), true);
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'sale', 'date', (current_date + 1)::text,
  'property_id', current_setting('t.tz'), 'party_id', current_setting('t.buyer'), 'price', '10.00', 'received_now', '10.00', 'account_id', current_setting('t.cash')));
select is(public.property_status(current_setting('t.org')::uuid, current_setting('t.tz')::uuid)::text, 'sold', 'a sale dated in the business''s today (UTC tomorrow) marks it sold');
select is((select timezone from public.organizations where id = current_setting('t.org')::uuid), 'Asia/Karachi', 'new businesses default to Pakistan time');

-- Regression (M5 review): journals touching Cost of Properties Sold for a property must keep the
-- build-up equal to the property cost (was 500 vs 530, and 0 vs 500).
with i as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'J-1') returning id)
select set_config('t.j1', (select id::text from i), true);
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'opening', 'lines', jsonb_build_array(
  jsonb_build_object('account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '1200'), 'debit', '500.00', 'property_id', current_setting('t.j1')))));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'journal', 'memo', 'reclass', 'lines', jsonb_build_array(
  jsonb_build_object('account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '5000'), 'debit', '30.00', 'property_id', current_setting('t.j1')),
  jsonb_build_object('account_id', current_setting('t.cash'), 'credit', '30.00'))));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'journal', 'memo', 'move', 'lines', jsonb_build_array(
  jsonb_build_object('account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '5000'), 'debit', '200.00', 'property_id', current_setting('t.j1')),
  jsonb_build_object('account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '1200'), 'credit', '200.00', 'property_id', current_setting('t.j1')))));
select is((select sum(amount) from public.property_breakdown(current_setting('t.org')::uuid, current_setting('t.j1')::uuid) where section = 'cost'),
          (select cost from public.property_summary(current_setting('t.org')::uuid, current_setting('t.j1')::uuid)),
          'journals on cost accounts keep the build-up equal to the cost');
select is((select sum(case section when 'sale' then amount when 'cost_of_sale' then -amount when 'income' then amount when 'expense' then -amount else 0 end)
           from public.property_breakdown(current_setting('t.org')::uuid, current_setting('t.j1')::uuid)),
          (select net_profit from public.property_summary(current_setting('t.org')::uuid, current_setting('t.j1')::uuid)),
          'and the profit rows still add up');

-- Regression (M5 review): an invalid time zone is rejected (it used to break property screens).
select throws_like(
  format($$update public.organizations set timezone = 'garbage' where id = %L$$, current_setting('t.org')),
  '%unknown time zone%', 'invalid time zone rejected');
select lives_ok(
  format($$update public.organizations set timezone = 'Asia/Dubai' where id = %L$$, current_setting('t.org')),
  'a real time zone is accepted');

-- Another business sees nothing.
select set_config('request.jwt.claims', '{"sub":"abababab-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is_empty(format('select 1 from public.party_balances(%L)', current_setting('t.org')), 'outsider gets no party balances');
select is_empty(format('select 1 from public.property_breakdown(%L, %L)', current_setting('t.org'), current_setting('t.prop')), 'outsider gets no property build-up');

select * from finish();
rollback;
