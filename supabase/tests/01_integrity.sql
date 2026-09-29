-- Ledger integrity: balanced vouchers, immutability, input validation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, email, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'owner@test.local', 'authenticated', 'authenticated');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select set_config('t.org', public.create_organization('Integrity Org')::text, true);
select set_config('t.cash', (select id::text from public.accounts
  where org_id = current_setting('t.org')::uuid and code = '1000'), true);
with i as (insert into public.properties (org_id, code, kind)
           values (current_setting('t.org')::uuid, 'DP-25', 'house') returning id)
select set_config('t.prop', (select id::text from i), true);
with i as (insert into public.parties (org_id, name, roles)
           values (current_setting('t.org')::uuid, 'Seller A', '{seller}') returning id)
select set_config('t.party', (select id::text from i), true);

select is((select count(*)::int from public.accounts where org_id = current_setting('t.org')::uuid),
          34, 'chart of accounts is seeded (27 + 7 for vehicles, gold and silver)');

-- A purchase partly on credit produces 3 balanced lines.
select set_config('t.v', (public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object(
  'type', 'purchase', 'date', '2026-01-10', 'property_id', current_setting('t.prop'),
  'party_id', current_setting('t.party'), 'price', '1000.00', 'paid_now', '400.00',
  'account_id', current_setting('t.cash'))) ->> 'id'), true);

select is((select count(*)::int from public.journal_lines where voucher_id = current_setting('t.v')::uuid),
          3, 'purchase posts 3 lines');
select is((select sum(debit) - sum(credit) from public.journal_lines
           where voucher_id = current_setting('t.v')::uuid), 0::numeric, 'purchase balances');
select is((select number from public.vouchers where id = current_setting('t.v')::uuid),
          'PUR-0001', 'voucher numbered per org and type');

-- Direct writes to the ledger are impossible for API users.
select throws_ok(
  format($$insert into public.journal_lines (org_id, voucher_id, entry_date, account_id, debit)
           values (%L, %L, current_date, %L, 1)$$,
         current_setting('t.org'), current_setting('t.v'), current_setting('t.cash')),
  '42501', null, 'API user cannot insert journal lines');
select is_empty(
  format($$update public.vouchers set amount = 1 where id = %L returning id$$, current_setting('t.v')),
  'API user cannot update vouchers (RLS hides the row)');

-- Even the database owner cannot break immutability or balance.
reset role;
select throws_like(
  format($$update public.journal_lines set debit = debit + 1 where voucher_id = %L$$, current_setting('t.v')),
  '%immutable%', 'journal lines are immutable');
select throws_like(
  format($$delete from public.vouchers where id = %L$$, current_setting('t.v')),
  '%immutable%', 'vouchers cannot be deleted');
select throws_like(
  format($q$do $d$
    declare v uuid;
    begin
      insert into public.vouchers (org_id, number, type, date, amount)
      values (%1$L, 'X-1', 'journal', current_date, 1) returning id into v;
      insert into public.journal_lines (org_id, voucher_id, entry_date, account_id, debit)
      values (%1$L, v, current_date, %2$L, 1);
      set constraints all immediate;
    end $d$ $q$, current_setting('t.org'), current_setting('t.cash')),
  '%unbalanced%', 'unbalanced voucher is rejected at commit');

-- Input validation.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_like(
  format($$select public.post_voucher(%L, '{"type":"expense","amount":"-5","account_id":"%s","category_account_id":"%s"}')$$,
         current_setting('t.org'), current_setting('t.cash'), current_setting('t.cash')),
  '%cannot be negative%', 'negative amounts rejected');
select throws_like(
  format($$select public.post_voucher(%L, '{"type":"capital","amount":"1.005","account_id":"%s"}')$$,
         current_setting('t.org'), current_setting('t.cash')),
  '%2 decimal places%', 'more than 2 decimals rejected');
select throws_like(
  format($$select public.post_voucher(%L, '{"type":"purchase","price":"100","paid_now":"200","property_id":"%s","account_id":"%s"}')$$,
         current_setting('t.org'), current_setting('t.prop'), current_setting('t.cash')),
  '%paid_now exceeds price%', 'cannot pay more than the price');
select throws_like(
  format($$select public.post_voucher(%L, '{"type":"bogus"}')$$, current_setting('t.org')),
  '%unknown voucher type%', 'unknown voucher type rejected');

-- Reversal nets to zero and marks the original.
select public.reverse_voucher(current_setting('t.v')::uuid, 'test');
select is((select coalesce(sum(debit - credit), 0) from public.journal_lines jl
           join public.accounts a on a.id = jl.account_id
           where jl.org_id = current_setting('t.org')::uuid and a.code = '1200'),
          0::numeric, 'reversal nets property cost back to zero');

select * from finish();
rollback;
