-- Dashboard v2 (spec 002 §6): monthly_performance reconciles with the income statement and the
-- cash balances, follows the organization's calendar, and shows nothing of another organization.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@dash.local', 'authenticated', 'authenticated', now()),
  ('dddddddd-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'x@dash.local', 'authenticated', 'authenticated', now());

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Dashboard Org')::text, true);
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);
select set_config('t.bank', public.add_money_account(current_setting('t.org')::uuid, 'bank', 'Meezan')::text, true);
with i as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'DP-25') returning id)
select set_config('t.prop', (select id::text from i), true);
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Seller A', '{seller}') returning id)
select set_config('t.seller', (select id::text from i), true);
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Buyer B', '{buyer,tenant}') returning id)
select set_config('t.buyer', (select id::text from i), true);

-- Activity from December 2025 to April 2026; the as-of date is 15 April 2026.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'capital', 'date', '2025-12-20', 'amount', '5000.00', 'account_id', current_setting('t.bank')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'purchase', 'date', '2026-01-10',
  'property_id', current_setting('t.prop'), 'party_id', current_setting('t.seller'), 'price', '1000.00', 'paid_now', '1000.00', 'account_id', current_setting('t.bank')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'transfer', 'date', '2026-01-12', 'amount', '300.00',
  'account_id', current_setting('t.bank'), 'to_account_id', current_setting('t.cash')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'rent', 'date', '2026-02-01',
  'property_id', current_setting('t.prop'), 'party_id', current_setting('t.buyer'), 'amount', '75.00', 'account_id', current_setting('t.cash')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'expense', 'date', '2026-02-02', 'property_id', current_setting('t.prop'),
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '6000'), 'amount', '25.00', 'account_id', current_setting('t.cash')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'income', 'date', '2026-02-20',
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '4200'), 'amount', '40.00', 'account_id', current_setting('t.cash')));
-- March has nothing. The sale is in April; an entry after the as-of date must not count.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'sale', 'date', '2026-04-05',
  'property_id', current_setting('t.prop'), 'party_id', current_setting('t.buyer'), 'price', '1500.00', 'received_now', '1500.00', 'account_id', current_setting('t.bank')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'income', 'date', '2026-04-20',
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '4900'), 'amount', '999.00', 'account_id', current_setting('t.cash')));

create temp table mp on commit drop as
  select * from public.monthly_performance(current_setting('t.org')::uuid, 6, '2026-04-15');

select is((select count(*)::int from mp), 6, 'one row per month for the requested number of months');
select is((select string_agg(month_start::text || '..' || month_end::text, ' ' order by month_start) from mp),
          '2025-11-01..2025-11-30 2025-12-01..2025-12-31 2026-01-01..2026-01-31 2026-02-01..2026-02-28 2026-03-01..2026-03-31 2026-04-01..2026-04-15',
          'months run oldest first and the as-of month ends on the as-of date');

-- 1. Every row equals the income statement for that month, column by column.
select is((select count(*)::int from mp,
             lateral (select public.income_statement(current_setting('t.org')::uuid, mp.month_start, mp.month_end) as r) s
           where mp.gross_trading_profit <> (s.r ->> 'gross_trading_profit')::numeric
              or mp.rent_income <> (s.r ->> 'rent_income')::numeric
              or mp.other_income <> (s.r ->> 'other_income')::numeric
              or mp.total_income <> (s.r ->> 'total_income')::numeric
              or mp.total_expenses <> (s.r ->> 'total_expenses')::numeric
              or mp.net_profit <> (s.r ->> 'net_profit')::numeric),
          0, 'every month matches income_statement for the same dates');
select is((select row(gross_trading_profit, rent_income, other_income, total_expenses, net_profit)::text from mp where month_start = '2026-02-01'),
          '(0.00,75.00,40.00,25.00,90.00)', 'February: rent, commission and an expense');
select is((select gross_trading_profit from mp where month_start = '2026-04-01'), 500.00::numeric(18, 2), 'April: profit on the sale (1500 - 1000)');
select is((select other_income from mp where month_start = '2026-04-01'), 0.00::numeric(18, 2), 'an entry after the as-of date is left out');

-- 2. The months add up to the income statement for the whole period.
select is((select sum(net_profit) from mp),
          (public.income_statement(current_setting('t.org')::uuid, '2025-11-01', '2026-04-15') ->> 'net_profit')::numeric,
          'the sum of monthly net profit equals the income statement for the period');

-- 3. Closing cash equals cash + bank balances at each month end.
select is((select string_agg(closing_cash::text, ' ' order by month_start) from mp),
          (select string_agg(b.total::text, ' ' order by mp.month_start) from mp,
             lateral (select coalesce(sum(balance), 0)::numeric(18, 2) as total from public.account_balances(current_setting('t.org')::uuid, mp.month_end)
                      where subtype in ('cash', 'bank')) b),
          'closing cash equals the cash and bank balances at every month end');
select is((select closing_cash from mp where month_start = '2026-04-01'), 5590.00::numeric(18, 2), 'April closing cash: 5000 - 1000 + 75 - 25 + 40 + 1500');

-- 4. Empty months are zeros; the range is checked.
select is((select closing_cash + total_income + total_expenses from mp where month_start = '2025-11-01'), 0.00::numeric, 'a month before any activity is all zeros');
select throws_ok(format('select * from public.monthly_performance(%L, 0)', current_setting('t.org')), '22023', null, 'zero months is rejected');
select throws_ok(format('select * from public.monthly_performance(%L, 25)', current_setting('t.org')), '22023', null, 'more than 24 months is rejected');

-- 5. Without an as-of date, the current month is the organization's month, not the server's.
--    At any moment one of these two zones is on a different date from UTC.
reset role;
update public.organizations set timezone = 'Pacific/Kiritimati' where id = current_setting('t.org')::uuid;
select set_config('t.plus14', (select month_end::text from public.monthly_performance(current_setting('t.org')::uuid, 1)), true);
update public.organizations set timezone = 'Etc/GMT+12' where id = current_setting('t.org')::uuid;
select set_config('t.minus12', (select month_end::text from public.monthly_performance(current_setting('t.org')::uuid, 1)), true);
select ok(current_setting('t.plus14')::date = (now() at time zone 'Pacific/Kiritimati')::date
          and current_setting('t.minus12')::date = (now() at time zone 'Etc/GMT+12')::date
          and (current_setting('t.plus14')::date <> current_date or current_setting('t.minus12')::date <> current_date),
          'the current month ends on the organization''s today in either zone');

-- 6. Another organization's member sees only zeros.
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.create_organization('Other Org');
select is((select sum(abs(total_income) + abs(total_expenses) + abs(closing_cash))
           from public.monthly_performance(current_setting('t.org')::uuid, 6, '2026-04-15')),
          0.00::numeric, 'a member of another organization gets zeros');
select is((select month_end from public.monthly_performance(current_setting('t.org')::uuid, 1)), (now() at time zone 'UTC')::date,
          'a non-member does not learn the organization''s calendar (UTC date, as under RLS)');

select ok(not has_function_privilege('anon', 'public.monthly_performance(uuid, int, date)', 'execute'), 'anon cannot call it');

select * from finish();
rollback;
