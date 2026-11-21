-- Loans (spec 008): loan received and loan repayment post to Loans Payable (2300) tagged with the lender and never
-- touch profit; a lender is never owed less than zero (repayment cap, void and edit guards, manual journal);
-- balances per lender; isolation by organization and by role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('0e190000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@loan.local', 'authenticated', 'authenticated', now()),
  ('0e190000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'v@loan.local', 'authenticated', 'authenticated', now()),
  ('0e190000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'x@loan.local', 'authenticated', 'authenticated', now());

-- Owner of org A (with a viewer); the outsider owns org B.
select set_config('request.jwt.claims', '{"sub":"0e190000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org_b', public.create_organization('Loans Org B')::text, true);
insert into public.parties (org_id, name, roles) values (current_setting('t.org_b')::uuid, 'Mallory', '{lender}');
select set_config('t.mallory', (select id::text from public.parties where org_id = current_setting('t.org_b')::uuid), true);

select set_config('request.jwt.claims', '{"sub":"0e190000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('t.org', public.create_organization('Loans Org A')::text, true);
insert into public.memberships (org_id, user_id, role) values
  (current_setting('t.org')::uuid, '0e190000-0000-0000-0000-000000000002', 'viewer');
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);
select set_config('t.loans', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '2300'), true);
select set_config('t.misc', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '6900'), true);

create temp table ids (k text primary key, id uuid) on commit drop;
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Ali', '{lender}') returning id)
insert into ids select 'ALI', id from i;
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Bilal', '{lender,partner}') returning id)
insert into ids select 'BILAL', id from i;
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Zed', '{seller}') returning id)
insert into ids select 'ZED', id from i;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;
create function pg_temp.today() returns date language sql as $$ select public.org_today(current_setting('t.org')::uuid) $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"0e190000-0000-0000-0000-00000000000%s","role":"authenticated"}', n), true)
$$;
create function pg_temp.post(p jsonb) returns jsonb language sql as $$
  select public.post_voucher(current_setting('t.org')::uuid, p || jsonb_build_object('account_id', current_setting('t.cash')))
$$;
create function pg_temp.lines(v uuid) returns text language sql as $$
  select string_agg(a.code || ':' || jl.debit || '/' || jl.credit, ' ' order by jl.id)
  from public.journal_lines jl join public.accounts a on a.id = jl.account_id where jl.voucher_id = v
$$;
create function pg_temp.loan(k text, amt text, d int default 0) returns jsonb language sql as $$
  select pg_temp.post(jsonb_build_object('type', 'loan_received', 'party_id', pg_temp.id(k), 'amount', amt, 'date', pg_temp.today() + d))
$$;
create function pg_temp.repay(k text, amt text, d int default 0) returns jsonb language sql as $$
  select pg_temp.post(jsonb_build_object('type', 'loan_repayment', 'party_id', pg_temp.id(k), 'amount', amt, 'date', pg_temp.today() + d))
$$;
-- Runs a statement, then makes the deferred loan check fire now (it normally fires at commit).
create function pg_temp.checked(sql text) returns void language plpgsql as $$
begin
  execute sql;
  set constraints public.journal_lines_loan_not_negative immediate;
  set constraints public.journal_lines_loan_not_negative deferred;
end $$;
create function pg_temp.owed(k text) returns numeric language sql as $$
  select owed from public.loan_balances(current_setting('t.org')::uuid) where party_id = pg_temp.id(k)
$$;
create function pg_temp.bal2300() returns numeric language sql as $$
  select balance from public.account_balances(current_setting('t.org')::uuid) where code = '2300'
$$;
create function pg_temp.income() returns jsonb language sql as $$
  select public.income_statement(current_setting('t.org')::uuid, '2000-01-01', '2100-01-01')
$$;

-- Real books first, so "unchanged" means something.
select pg_temp.post(jsonb_build_object('type', 'capital', 'date', pg_temp.today() - 40, 'amount', '1000000.00'));
select pg_temp.post(jsonb_build_object('type', 'income', 'date', pg_temp.today() - 30, 'amount', '12000.00',
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '4200')));
create temp table snap on commit drop as select pg_temp.income() as inc;

-- ---------------------------------------------------------------------------
-- The party role
-- ---------------------------------------------------------------------------
select ok((select roles from public.parties where id = pg_temp.id('ALI')) = '{lender}', 'a party can have the role lender');
select lives_ok($$insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Old Role', '{seller,buyer,tenant,agent,partner,other}')$$,
  'the old roles are still accepted');
select throws_like($$insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Bad Role', '{banker}')$$,
  '%parties_roles_check%', 'an unknown role is still refused');

-- ---------------------------------------------------------------------------
-- V15 loan received, V16 repayment: exact lines, profit untouched
-- ---------------------------------------------------------------------------
select set_config('t.l1', pg_temp.loan('ALI', '500000.00', -10)::text, true);
select is(pg_temp.lines((current_setting('t.l1')::jsonb ->> 'id')::uuid), '1000:500000.00/0.00 2300:0.00/500000.00',
  'loan received: debit the account, credit Loans Payable');
select ok((current_setting('t.l1')::jsonb ->> 'number') like 'LNR-%', 'a loan received is numbered LNR');
select is((select party_id from public.journal_lines where voucher_id = (current_setting('t.l1')::jsonb ->> 'id')::uuid
           and account_id = current_setting('t.loans')::uuid), pg_temp.id('ALI'), 'the Loans Payable line carries the lender');
select is(pg_temp.income(), (select inc from snap), 'a loan does not change the income statement');
select is((select sum(debit) - sum(credit) from public.trial_balance(current_setting('t.org')::uuid)), 0.00::numeric, 'the trial balance stays at zero');
select is(pg_temp.bal2300(), 500000.00::numeric, 'Loans Payable shows the debt');
select is((select row(borrowed, repaid, owed)::text from public.loan_balances(current_setting('t.org')::uuid) where party_id = pg_temp.id('ALI')),
  '(500000.00,0.00,500000.00)', 'loan_balances: borrowed, repaid and owed');

select set_config('t.r1', pg_temp.repay('ALI', '200000.00', -5)::text, true);
select is(pg_temp.lines((current_setting('t.r1')::jsonb ->> 'id')::uuid), '2300:200000.00/0.00 1000:0.00/200000.00',
  'repayment: debit Loans Payable, credit the account');
select ok((current_setting('t.r1')::jsonb ->> 'number') like 'LNP-%', 'a repayment is numbered LNP');
select is(pg_temp.owed('ALI'), 300000.00::numeric, 'owed after a part repayment');
select is(pg_temp.income(), (select inc from snap), 'a repayment does not change the income statement either');
select is((select string_agg(balance::text, ' ' order by seq) from public.loan_ledger(current_setting('t.org')::uuid, pg_temp.id('ALI'))),
  '500000.00 300000.00', 'the statement carries a running balance owed');
select is((select string_agg(voucher_type::text, ' ' order by seq) from public.loan_ledger(current_setting('t.org')::uuid, pg_temp.id('ALI'))),
  'loan_received loan_repayment', 'the statement names each entry type');

-- Two lenders stay apart
select pg_temp.loan('BILAL', '100000.00', -4);
select pg_temp.repay('BILAL', '40000.00', -3);
select is(pg_temp.owed('ALI'), 300000.00::numeric, 'a repayment to one lender leaves the other unchanged');
select is(pg_temp.owed('BILAL'), 60000.00::numeric, 'the second lender has their own balance');
select is(pg_temp.bal2300(), 360000.00::numeric, 'Loans Payable is the sum of both lenders');

-- ---------------------------------------------------------------------------
-- The repayment cap and the other refusals
-- ---------------------------------------------------------------------------
select throws_like($$select pg_temp.repay('ALI', '300000.01')$$, '%You owe Ali only PKR 300,000.00%', 'a repayment above what is owed is refused');
select is(pg_temp.owed('ALI'), 300000.00::numeric, 'a refused repayment changes nothing');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'loan_received', 'party_id', pg_temp.id('ZED'), 'amount', '1.00'))$$,
  '%Choose a lender%', 'a party without the role lender is refused');
select throws_like($$select pg_temp.post(jsonb_build_object('type', 'loan_received', 'amount', '1.00'))$$,
  '%Choose a lender%', 'a loan with no lender is refused');
select throws_like(format($$select pg_temp.post(jsonb_build_object('type', 'loan_received', 'party_id', %L, 'amount', '1.00'))$$,
  current_setting('t.mallory')), '%party not found%', 'a lender of another organization is refused');
select throws_like($$select pg_temp.loan('ALI', '1.00', 1)$$, '%cannot be dated in the future%', 'a future date is refused');
select throws_like($$select pg_temp.loan('ALI', '0.00')$$, '%greater than zero%', 'a zero amount is refused');
select throws_like($$select pg_temp.loan('ALI', '1.005')$$, '%more than 2 decimal places%', 'three decimals are refused');
select throws_like($$select pg_temp.loan('ALI', '-5.00')$$, '%cannot be negative%', 'a negative amount is refused');

-- Full repayment
select pg_temp.repay('ALI', '300000.00');
select is(pg_temp.owed('ALI'), 0.00::numeric, 'a full repayment leaves nothing owed');
select is((select row(borrowed, repaid)::text from public.loan_balances(current_setting('t.org')::uuid) where party_id = pg_temp.id('ALI')),
  '(500000.00,500000.00)', 'borrowed and repaid agree after a full repayment');
select is(pg_temp.income(), (select inc from snap), 'the income statement is still the same after all of it');

-- ---------------------------------------------------------------------------
-- Void and edit
-- ---------------------------------------------------------------------------
select set_config('t.last', (select id::text from public.vouchers where org_id = current_setting('t.org')::uuid and type = 'loan_repayment'
                              and party_id = pg_temp.id('ALI') order by number desc limit 1), true);
select public.reverse_voucher(current_setting('t.last')::uuid, 'wrong day');
select is(pg_temp.owed('ALI'), 300000.00::numeric, 'voiding a repayment raises what is owed again');
select is((select count(*)::int from public.loan_ledger(current_setting('t.org')::uuid, pg_temp.id('ALI'))), 4, 'the void shows as its own line on the statement');
select throws_like(format($$select pg_temp.checked(%L)$$, format('select public.reverse_voucher(%L)', (current_setting('t.l1')::jsonb ->> 'id'))),
  '%repaid more than the loans on record%', 'voiding a loan that was repaid in part is refused');
select is(pg_temp.owed('ALI'), 300000.00::numeric, 'the refused void changed nothing');
select throws_like(format($$select pg_temp.checked(%L)$$, format('select public.edit_voucher(%L, %L)', (current_setting('t.l1')::jsonb ->> 'id'), '{"amount":"150000.00"}')),
  '%repaid more than the loans on record%', 'editing a loan below what was repaid is refused');
select lives_ok(format($$select pg_temp.checked(%L)$$, format('select public.edit_voucher(%L, %L)', (current_setting('t.l1')::jsonb ->> 'id'), '{"amount":"600000.00"}')),
  'editing a loan upwards is allowed');
select is(pg_temp.owed('ALI'), 400000.00::numeric, 'the edited loan changes what is owed');
select lives_ok(format($$select pg_temp.checked(%L)$$, format('select public.edit_voucher(%L, %L)',
  (select id from public.vouchers where org_id = current_setting('t.org')::uuid and type = 'loan_received' and party_id = pg_temp.id('ALI')
     and status = 'posted' and reverses_id is null), '{"memo":"for the plot"}')),
  'editing only the note of a part-repaid loan is allowed');
select is(pg_temp.owed('ALI'), 400000.00::numeric, 'the note edit changed no amount');

-- ---------------------------------------------------------------------------
-- A manual journal on Loans Payable
-- ---------------------------------------------------------------------------
select pg_temp.post(jsonb_build_object('type', 'journal', 'date', pg_temp.today(), 'lines', jsonb_build_array(
  jsonb_build_object('account_id', current_setting('t.cash'), 'debit', '10000.00'),
  jsonb_build_object('account_id', current_setting('t.loans'), 'credit', '10000.00'))));
select is((select owed from public.loan_balances(current_setting('t.org')::uuid) where party_id is null), 10000.00::numeric,
  'a journal with no lender shows as not assigned to a lender');
select is((select sum(owed) from public.loan_balances(current_setting('t.org')::uuid)), pg_temp.bal2300(),
  'the rows add up to the Loans Payable balance');
select throws_like(format($$select pg_temp.checked(%L)$$, format($q$select pg_temp.post(jsonb_build_object('type', 'journal', 'lines', jsonb_build_array(
    jsonb_build_object('account_id', %L, 'debit', '999999.00', 'party_id', %L),
    jsonb_build_object('account_id', %L, 'credit', '999999.00'))))$q$, current_setting('t.loans'), pg_temp.id('BILAL'), current_setting('t.misc'))),
  '%repaid more than the loans on record%', 'a journal cannot push a lender below zero either');
select lives_ok($$select pg_temp.repay('BILAL', '60000.00')$$, 'a lender can be repaid to exactly zero');

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
select pg_temp.as_user(2);
select is((select count(*)::int from public.loan_balances(current_setting('t.org')::uuid) where party_id is not null), 2, 'a viewer can read the balances');
select throws_like($$select pg_temp.loan('ALI', '1.00')$$, '%not a member of this organization with role%', 'a viewer cannot record a loan');
select pg_temp.as_user(3);
select is((select count(*)::int from public.loan_balances(current_setting('t.org')::uuid)), 0, 'a member of another organization sees no balances');
select is((select count(*)::int from public.loan_ledger(current_setting('t.org')::uuid, pg_temp.id('ALI'))), 0, 'nor a statement');
select throws_like($$select pg_temp.loan('ALI', '1.00')$$, '%not a member of this organization with role%', 'nor can they record a loan');
select is((select count(*)::int from public.loan_balances(current_setting('t.org_b')::uuid)), 1, 'but sees their own business');
select pg_temp.as_user(1);
reset role;
select ok(not has_function_privilege('anon', 'public.loan_balances(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.loan_ledger(uuid, uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.loan_balances(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.loan_ledger(uuid, uuid)', 'execute'), 'anon cannot read loans; signed-in users can');
select ok(not has_function_privilege('authenticated', 'public._loan_owed(uuid, uuid)', 'execute'), 'the internal owed helper is not callable through the API');
select ok(not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name like '%loan%'),
  'loans have no table of their own: nothing to leave unprotected');

select * from finish();
rollback;
