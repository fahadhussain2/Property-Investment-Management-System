-- Holdings (spec 003): vehicles, gold and silver. Accounts, record rules, posting H1–H3 (exact lines),
-- weight arithmetic and limits, reversal, valuation, income statement, and organization isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('0a1d0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@h.local', 'authenticated', 'authenticated', now()),
  ('0a1d0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'v@h.local', 'authenticated', 'authenticated', now()),
  ('0a1d0000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'x@h.local', 'authenticated', 'authenticated', now());

-- Owner of org A.
select set_config('request.jwt.claims', '{"sub":"0a1d0000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Holdings Org')::text, true);
insert into public.memberships (org_id, user_id, role) values (current_setting('t.org')::uuid, '0a1d0000-0000-0000-0000-000000000002', 'viewer');
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);

create temp table ids (k text primary key, id uuid) on commit drop;
insert into ids
  select 'A' || code, id from public.accounts where org_id = current_setting('t.org')::uuid;
with i as (insert into public.holdings (org_id, class, code, make, model, year)
           values (current_setting('t.org')::uuid, 'vehicle', 'CAR-1', 'Toyota', 'Corolla', 2022) returning id)
insert into ids select 'CAR-1', id from i;
with i as (insert into public.holdings (org_id, class, code) values (current_setting('t.org')::uuid, 'vehicle', 'CAR-2') returning id)
insert into ids select 'CAR-2', id from i;
with i as (insert into public.holdings (org_id, class, code, name, purity)
           values (current_setting('t.org')::uuid, 'gold', 'G-01', 'Bar 22K', 0.9167) returning id)
insert into ids select 'G-01', id from i;
with i as (insert into public.holdings (org_id, class, code, purity) values (current_setting('t.org')::uuid, 'silver', 'S-01', 0.999) returning id)
insert into ids select 'S-01', id from i;
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Dealer', '{seller,buyer}') returning id)
insert into ids select 'DEALER', id from i;

create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;
create function pg_temp.post(p jsonb) returns jsonb language sql as $$
  select public.post_voucher(current_setting('t.org')::uuid, p || jsonb_build_object('account_id', current_setting('t.cash')))
$$;
-- "code:debit/credit" per line, in posting order.
create function pg_temp.lines(v uuid) returns text language sql as $$
  select string_agg(a.code || ':' || jl.debit || '/' || jl.credit, ' ' order by jl.id)
  from public.journal_lines jl join public.accounts a on a.id = jl.account_id where jl.voucher_id = v
$$;
create function pg_temp.ov(k text) returns public.holdings_overview language sql as $$
  select * from public.holdings_overview where id = pg_temp.id(k)
$$;

select pg_temp.post('{"type":"capital","date":"2026-01-01","amount":"20000000.00"}');

-- Accounts and records ---------------------------------------------------------------------------------
select is((select count(*)::int from public.accounts where org_id = current_setting('t.org')::uuid
           and code in ('1400', '1500', '1510', '4250', '6200', '6210', '6220')), 7, 'the seven spec 003 heads are seeded');
reset role;
select public._seed_holding_accounts(current_setting('t.org')::uuid);
select is((select count(*)::int from public.accounts where org_id = current_setting('t.org')::uuid), 34,
          'seeding the new heads again adds nothing (safe backfill)');
set local role authenticated;
select is(public.unit_to_grams(1, 'tola'), 11.6638038000::numeric, '1 tola = 11.6638038 g');
select throws_ok(format($$insert into public.holdings (org_id, class, code) values (%L, 'gold', 'G-X')$$, current_setting('t.org')),
  '23514', null, 'a gold item needs a purity');
select throws_ok(format($$insert into public.holdings (org_id, class, code, purity) values (%L, 'vehicle', 'V-X', 1)$$, current_setting('t.org')),
  '23514', null, 'a vehicle has no purity');
select throws_like(format($$update public.holdings set class = 'gold', purity = 1 where id = %L$$, pg_temp.id('CAR-1')),
  '%class cannot be changed%', 'a holding''s class never changes');
select throws_ok(format($$insert into public.holdings (org_id, class, code) values (%L, 'vehicle', 'car-1')$$, current_setting('t.org')),
  '23505', null, 'codes are unique per business, ignoring case');

-- Vehicle: buy, cost, running expense, sell (spec §9 scenario 1) -----------------------------------------
insert into ids select 'V-BUY', (pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'date', '2026-02-01',
  'holding_id', pg_temp.id('CAR-1'), 'price', '3000000.00', 'paid_now', '3000000.00')) ->> 'id')::uuid;
select is(pg_temp.lines(pg_temp.id('V-BUY')), '1400:3000000.00/0.00 1000:0.00/3000000.00', 'vehicle purchase: Dr Vehicles at Cost, Cr cash');
select is((select holding_id from public.vouchers where id = pg_temp.id('V-BUY')), pg_temp.id('CAR-1'), 'the voucher carries the vehicle');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'holding_id', pg_temp.id('CAR-1'), 'price', '1.00', 'paid_now', '1.00'))$$,
  '%already recorded as bought%', 'a vehicle is bought once');
select pg_temp.post(jsonb_build_object('type', 'holding_cost', 'date', '2026-02-05', 'holding_id', pg_temp.id('CAR-1'),
  'amount', '50000.00', 'memo', 'Registration transfer'));
select pg_temp.post(jsonb_build_object('type', 'expense', 'date', '2026-03-01', 'holding_id', pg_temp.id('CAR-1'),
  'amount', '20000.00', 'category_account_id', pg_temp.id('A6200')));
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'expense', 'holding_id', pg_temp.id('G-01'), 'amount', '1.00', 'category_account_id', pg_temp.id('A6200')))$$,
  '%only a vehicle%', 'only a vehicle can be tagged on an expense');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'capital', 'holding_id', pg_temp.id('CAR-1'), 'amount', '1.00'))$$,
  '%cannot be tagged%', 'other entries cannot carry a holding');

select set_config('t.vsale', pg_temp.post(jsonb_build_object('type', 'holding_sale', 'date', '2026-06-01', 'holding_id', pg_temp.id('CAR-1'),
  'party_id', pg_temp.id('DEALER'), 'price', '3200000.00', 'received_now', '3000000.00'))::text, true);
select is(current_setting('t.vsale')::jsonb - 'id' - 'number', '{"cost":"3050000.00","profit":"150000.00"}'::jsonb,
  'vehicle sale relieves the full cost (price + costs) and returns the gain');
select is(pg_temp.lines((current_setting('t.vsale')::jsonb ->> 'id')::uuid),
  '1000:3000000.00/0.00 1300:200000.00/0.00 1400:0.00/3050000.00 4250:0.00/150000.00',
  'vehicle sale lines: cash, receivable, cost relieved, gain');
select is((select row(status, cost, total_cost, running_expenses, sale_price, realized_gain)::text from pg_temp.ov('CAR-1')),
  '(sold,0.00,3050000.00,20000.00,3200000.00,150000.00)', 'CAR-1 overview after the sale');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'holding_cost', 'holding_id', pg_temp.id('CAR-1'), 'amount', '1.00'))$$,
  '%already sold%', 'no costs on a sold vehicle');
select throws_like(format($$select public.reverse_voucher(%L)$$, pg_temp.id('V-BUY')),
  '%reverse the sale of CAR-1 first%', 'the purchase of a sold vehicle cannot be reversed');

-- Vehicle bought partly on credit, seller paid off, purchase edited ---------------------------------------
insert into ids select 'V2-BUY', (pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'date', '2026-02-01',
  'holding_id', pg_temp.id('CAR-2'), 'party_id', pg_temp.id('DEALER'), 'price', '1000000.00', 'paid_now', '400000.00')) ->> 'id')::uuid;
select pg_temp.post(jsonb_build_object('type', 'pay_seller', 'date', '2026-02-10', 'holding_id', pg_temp.id('CAR-2'),
  'party_id', pg_temp.id('DEALER'), 'amount', '600000.00'));
select is((select sum(credit - debit) from public.journal_lines where holding_id = pg_temp.id('CAR-2') and account_id = pg_temp.id('A2000')),
  0.00::numeric, 'the seller balance of CAR-2 is paid off (payable tagged with the vehicle)');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'pay_seller', 'holding_id', pg_temp.id('CAR-2'),
  'property_id', gen_random_uuid(), 'party_id', pg_temp.id('DEALER'), 'amount', '1.00'))$$,
  '%property not found%', 'pay seller checks the property it is given');
with p as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'P-1') returning id)
insert into ids select 'P-1', id from p;
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'pay_seller', 'holding_id', pg_temp.id('CAR-2'),
  'property_id', pg_temp.id('P-1'), 'party_id', pg_temp.id('DEALER'), 'amount', '1.00'))$$,
  '%not both%', 'pay seller takes a property or a holding, not both');
select pg_temp.post(jsonb_build_object('type', 'holding_cost', 'holding_id', pg_temp.id('CAR-2'), 'amount', '10000.00'));
select lives_ok(format($$select public.edit_voucher(%L, '{"price":"1100000.00"}')$$, pg_temp.id('V2-BUY')),
  'a vehicle purchase can be edited after costs were added');
select is((pg_temp.ov('CAR-2')).cost, 1110000.00::numeric(18, 2), 'CAR-2 cost = corrected price + cost');

-- Gold: partial sale, over-sale, reversal, sale of the rest (spec §9 scenarios 2, 3, 6) -------------------
select pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'date', '2026-03-01', 'holding_id', pg_temp.id('G-01'),
  'price', '2000000.00', 'paid_now', '2000000.00', 'weight', '10', 'unit', 'tola'));
select is((pg_temp.ov('G-01')).weight_g, 116.638038::numeric, '10 tola is stored as 116.638038 g exactly');
select set_config('t.gsale', pg_temp.post(jsonb_build_object('type', 'holding_sale', 'date', '2026-04-01', 'holding_id', pg_temp.id('G-01'),
  'price', '720000.00', 'received_now', '720000.00', 'weight', '3', 'unit', 'tola'))::text, true);
select is(current_setting('t.gsale')::jsonb - 'id' - 'number', '{"cost":"600000.00","profit":"120000.00","weight_g":"34.9914114"}'::jsonb,
  'selling 3 of 10 tola relieves 3/10 of the cost');
select is((select row(status, weight_g, cost)::text from pg_temp.ov('G-01')), '(partly_sold,81.6466266,1400000.00)',
  'G-01 after the partial sale: 7 tola and 1,400,000 left');
select is((select quantity_g from public.journal_lines jl where voucher_id = (current_setting('t.gsale')::jsonb ->> 'id')::uuid and quantity_g is not null),
  -34.9914114000::numeric, 'the weight leaves on the credit line');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'holding_sale', 'holding_id', pg_temp.id('G-01'),
  'price', '1.00', 'received_now', '1.00', 'weight', '8', 'unit', 'tola'))$$,
  '%more than the weight held%', 'cannot sell more than is held');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'holding_id', pg_temp.id('G-01'),
  'price', '1.00', 'paid_now', '1.00', 'weight', '1.0001', 'unit', 'g'))$$,
  '%more than 3 decimal places%', 'weights have at most 3 decimals');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'holding_id', pg_temp.id('G-01'),
  'price', '1.00', 'paid_now', '1.00', 'weight', '1', 'unit', 'masha'))$$,
  '%unit must be%', 'unknown units are rejected');
select public.reverse_voucher((current_setting('t.gsale')::jsonb ->> 'id')::uuid);
select is((select row(status, weight_g, cost)::text from pg_temp.ov('G-01')), '(held,116.638038,2000000.00)',
  'reversing the partial sale restores the weight and the cost');
select set_config('t.gall', pg_temp.post(jsonb_build_object('type', 'holding_sale', 'date', '2026-05-01', 'holding_id', pg_temp.id('G-01'),
  'price', '2100000.00', 'received_now', '2100000.00', 'whole', true))::text, true);
select is(current_setting('t.gall')::jsonb ->> 'cost', '2000000.00', 'selling the whole item relieves all of its cost');
select is((select row(status, weight_g, cost)::text from pg_temp.ov('G-01')), '(sold,0,0.00)', 'G-01 is sold with nothing left');

-- Silver: units add up; weight can never go below zero ---------------------------------------------------
select pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'date', '2026-03-01', 'holding_id', pg_temp.id('S-01'),
  'price', '300000.00', 'paid_now', '300000.00', 'weight', '1', 'unit', 'kg'));
select pg_temp.post(jsonb_build_object('type', 'holding_purchase', 'date', '2026-03-02', 'holding_id', pg_temp.id('S-01'),
  'price', '20000.00', 'paid_now', '20000.00', 'weight', '5', 'unit', 'tola'));
select is((pg_temp.ov('S-01')).weight_g, 1058.319019::numeric, '1 kg + 5 tola = 1,058.319019 g');
set constraints public.journal_lines_weight immediate;
select throws_like(format($$select pg_temp.post(jsonb_build_object('type', 'journal', 'lines', jsonb_build_array(
    jsonb_build_object('account_id', %L, 'debit', '50000.00'),
    jsonb_build_object('account_id', %L, 'credit', '50000.00', 'holding_id', %L, 'weight', '2', 'unit', 'kg'))))$$,
    pg_temp.id('A6900'), pg_temp.id('A1510'), pg_temp.id('S-01')),
  '%cannot go below zero%', 'a journal cannot take out more weight than is held');
set constraints public.journal_lines_weight deferred;
select throws_like(format($$select pg_temp.post(jsonb_build_object('type', 'journal', 'lines', jsonb_build_array(
    jsonb_build_object('account_id', %L, 'debit', '1.00', 'weight', '1'),
    jsonb_build_object('account_id', %L, 'credit', '1.00'))))$$, pg_temp.id('A6900'), pg_temp.id('A1000')),
  '%only gold and silver entries carry a weight%', 'only metal lines carry a weight');
select throws_like(format($$select pg_temp.post(jsonb_build_object('type', 'journal', 'lines', jsonb_build_array(
    jsonb_build_object('account_id', %L, 'debit', '1.00', 'holding_id', %L),
    jsonb_build_object('account_id', %L, 'credit', '1.00'))))$$, pg_temp.id('A1500'), pg_temp.id('S-01'), pg_temp.id('A1000')),
  '%cannot be posted to gold%', 'a silver item cannot be posted to Gold at Cost');

-- Valuation (market value is information only) and the income statement --------------------------------
insert into public.metal_rates (org_id, metal, rate_date, rate_per_tola) values (current_setting('t.org')::uuid, 'silver', '2026-06-01', 3000);
select is((select row(items, weight_g, cost, rate_per_tola, market_value)::text from public.holdings_valuation(current_setting('t.org')::uuid, '2026-12-31') where class = 'silver'),
  '(1,1058.319019,320000.00,3000.00,271933.77)', 'silver at 3,000 per tola: 1,058.319019 g ÷ 11.6638038 × 3,000 × 0.999');
select is((select row(market_value, rate_per_tola)::text from public.holdings_valuation(current_setting('t.org')::uuid, '2026-12-31') where class = 'gold'),
  '(0.00,)', 'gold: nothing held, so market value 0 even without a rate');
select is((select market_value from public.holdings_valuation(current_setting('t.org')::uuid, '2026-05-31') where class = 'silver'),
  null::numeric, 'no silver rate yet on that date: market value is unknown, not 0');
select is((select jsonb_build_object('gains', r ->> 'asset_gains', 'by_class', r -> 'asset_gains_by_class',
                                      'vehicle', r ->> 'vehicle_expenses', 'general', r ->> 'general_expenses', 'total', r ->> 'total_expenses')
           from public.income_statement(current_setting('t.org')::uuid, '2026-01-01', '2026-12-31') r),
  '{"gains":"250000.00","by_class":{"gold":"100000.00","vehicle":"150000.00"},"vehicle":"20000.00","general":"0.00","total":"20000.00"}'::jsonb,
  'income statement: gains by class and vehicle expenses in their own group');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'income', 'amount', '1.00', 'category_account_id', pg_temp.id('A4250')))$$,
  '%valid income category%', 'Gain on Sale of Assets is posted only by a sale');
select is((select sum(debit) - sum(credit) from public.trial_balance(current_setting('t.org')::uuid)), 0.00::numeric, 'trial balance still balances');

-- Isolation --------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"0a1d0000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$insert into public.holdings (org_id, class, code) values (%L, 'vehicle', 'VIEW-1')$$, current_setting('t.org')),
  '42501', null, 'a viewer cannot add a vehicle');

select set_config('request.jwt.claims', '{"sub":"0a1d0000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('t.orgb', public.create_organization('Other Org')::text, true);
select is((select count(*)::int from public.holdings where org_id = current_setting('t.org')::uuid)
        + (select count(*)::int from public.metal_rates where org_id = current_setting('t.org')::uuid)
        + (select count(*)::int from public.holdings_overview where org_id = current_setting('t.org')::uuid), 0,
  'another business sees none of our holdings, rates or overview');
select throws_ok(format($$insert into public.metal_rates (org_id, metal, rate_date, rate_per_tola) values (%L, 'gold', '2026-01-01', 1)$$, current_setting('t.org')),
  '42501', null, 'another business cannot set our rates');
select throws_like(format($$select public.post_voucher(%L, jsonb_build_object('type', 'holding_purchase', 'holding_id', %L, 'price', '1.00'))$$,
  current_setting('t.orgb'), pg_temp.id('S-01')),
  '%item not found%', 'our item cannot be used in another business''s entry');

select * from finish();
rollback;
