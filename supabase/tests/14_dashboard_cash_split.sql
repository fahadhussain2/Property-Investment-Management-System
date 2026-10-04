-- Spec 005 amendment 4: monthly_performance splits month-end cash into cash in hand and bank, for the
-- separate Cash and Bank tiles' trend lines. Each part equals the balances of its accounts at every month
-- end (including activity before the first month), the parts add up to closing_cash, and another
-- organization's member sees only zeros.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('dddddddd-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'o@split.local', 'authenticated', 'authenticated', now()),
  ('dddddddd-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000000', 'x@split.local', 'authenticated', 'authenticated', now());

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000011","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Split Org')::text, true);
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);
select set_config('t.bank', public.add_money_account(current_setting('t.org')::uuid, 'bank', 'Meezan')::text, true);
select set_config('t.bank2', public.add_money_account(current_setting('t.org')::uuid, 'bank', 'HBL')::text, true);

-- Before the 3-month window (Feb to Apr 2026): capital into the bank, part of it drawn as cash.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'capital', 'date', '2025-12-20', 'amount', '5000.00', 'account_id', current_setting('t.bank')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'transfer', 'date', '2026-01-12', 'amount', '300.00',
  'account_id', current_setting('t.bank'), 'to_account_id', current_setting('t.cash')));
-- Inside the window: cash capital in February, bank to bank in March (bank total unchanged), bank to cash in April.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'capital', 'date', '2026-02-03', 'amount', '200.00', 'account_id', current_setting('t.cash')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'transfer', 'date', '2026-03-10', 'amount', '1000.00',
  'account_id', current_setting('t.bank'), 'to_account_id', current_setting('t.bank2')));
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'transfer', 'date', '2026-04-02', 'amount', '50.00',
  'account_id', current_setting('t.bank2'), 'to_account_id', current_setting('t.cash')));
-- After the as-of date: must not count.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'capital', 'date', '2026-04-20', 'amount', '999.00', 'account_id', current_setting('t.cash')));

create temp table mp on commit drop as
  select * from public.monthly_performance(current_setting('t.org')::uuid, 3, '2026-04-15');

select is((select string_agg(closing_cash_in_hand::text || '/' || closing_bank::text, ' ' order by month_start) from mp),
          '500.00/4700.00 500.00/4700.00 550.00/4650.00',
          'cash in hand and bank at each month end, carrying what happened before the window');
select is((select count(*)::int from mp where closing_cash <> closing_cash_in_hand + closing_bank), 0,
          'the parts add up to closing cash in every month');
select is((select string_agg(closing_cash_in_hand::text, ' ' order by month_start) from mp),
          (select string_agg(b.total::text, ' ' order by mp.month_start) from mp,
             lateral (select coalesce(sum(balance), 0)::numeric(18, 2) as total from public.account_balances(current_setting('t.org')::uuid, mp.month_end)
                      where subtype = 'cash') b),
          'cash in hand equals the cash accounts'' balances at every month end');
select is((select string_agg(closing_bank::text, ' ' order by month_start) from mp),
          (select string_agg(b.total::text, ' ' order by mp.month_start) from mp,
             lateral (select coalesce(sum(balance), 0)::numeric(18, 2) as total from public.account_balances(current_setting('t.org')::uuid, mp.month_end)
                      where subtype = 'bank') b),
          'bank equals the bank accounts'' balances at every month end');
select is((select closing_cash_in_hand + closing_bank from public.monthly_performance(current_setting('t.org')::uuid, 1, '2025-11-30')),
          0.00::numeric, 'a month before any activity is zero');

-- Another organization's member sees only zeros.
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000012","role":"authenticated"}', true);
select public.create_organization('Other Split Org');
select is((select sum(abs(closing_cash_in_hand) + abs(closing_bank))
           from public.monthly_performance(current_setting('t.org')::uuid, 3, '2026-04-15')),
          0.00::numeric, 'a member of another organization gets zeros');

reset role;
select ok(not has_function_privilege('anon', 'public.monthly_performance(uuid, int, date)', 'execute'), 'anon still cannot call it');

select * from finish();
rollback;
