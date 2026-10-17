-- Registers (spec 007): memo ledgers outside the books. Nothing a register does changes the books and nothing
-- the books do changes a register; entries are immutable (void or correct, never edit); isolation by organization
-- and by role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('0e180000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@reg.local', 'authenticated', 'authenticated', now()),
  ('0e180000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'x@reg.local', 'authenticated', 'authenticated', now()),
  ('0e180000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'v@reg.local', 'authenticated', 'authenticated', now()),
  ('0e180000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'a@reg.local', 'authenticated', 'authenticated', now());

-- Owner of org A, with a viewer and an accountant; the outsider owns org B.
select set_config('request.jwt.claims', '{"sub":"0e180000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Registers Org')::text, true);
insert into public.memberships (org_id, user_id, role) values
  (current_setting('t.org')::uuid, '0e180000-0000-0000-0000-000000000003', 'viewer'),
  (current_setting('t.org')::uuid, '0e180000-0000-0000-0000-000000000004', 'accountant');
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);

create function pg_temp.today() returns date language sql as $$ select public.org_today(current_setting('t.org')::uuid) $$;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"0e180000-0000-0000-0000-00000000000%s","role":"authenticated"}', n), true)
$$;
create function pg_temp.post(p jsonb) returns jsonb language sql as $$
  select public.post_voucher(current_setting('t.org')::uuid, p || jsonb_build_object('account_id', current_setting('t.cash')))
$$;
-- Every figure the books produce for this organization, as one value to compare before and after.
create function pg_temp.books() returns jsonb language sql as $$
  select jsonb_build_object(
    'vouchers', (select jsonb_agg(to_jsonb(v) order by v.number) from public.vouchers v where v.org_id = current_setting('t.org')::uuid),
    'lines', (select jsonb_agg(to_jsonb(l) order by l.id) from public.journal_lines l where l.org_id = current_setting('t.org')::uuid),
    'balances', (select jsonb_agg(to_jsonb(b) order by b.code) from public.account_balances(current_setting('t.org')::uuid) b),
    'income', public.income_statement(current_setting('t.org')::uuid, '2000-01-01', '2100-01-01'),
    'balance_sheet', public.balance_sheet(current_setting('t.org')::uuid),
    'trial', (select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from public.trial_balance(current_setting('t.org')::uuid) t),
    'monthly', (select jsonb_agg(to_jsonb(m) order by m.month_start) from public.monthly_performance(current_setting('t.org')::uuid, 12) m)
  )
$$;
create function pg_temp.balances(r uuid) returns text language sql as $$
  select string_agg(running_balance::text, ' ' order by entry_date, seq) from public.register_ledger(r)
$$;

-- Some real books first, so "unchanged" means something.
select pg_temp.post(jsonb_build_object('type', 'capital', 'date', pg_temp.today() - 40, 'amount', '500000.00'));
select pg_temp.post(jsonb_build_object('type', 'income', 'date', pg_temp.today() - 30, 'amount', '12000.00',
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '4200')));
select pg_temp.post(jsonb_build_object('type', 'expense', 'date', pg_temp.today() - 20, 'amount', '2500.00',
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '6000')));
create temp table snap on commit drop as select pg_temp.books() as b;
select ok((select b from snap) -> 'vouchers' is not null and jsonb_array_length((select b from snap) -> 'vouchers') = 3, 'the books have three vouchers to compare');

-- ---------------------------------------------------------------------------
-- A register and its ledger: 53,650 + 1,000,000 - 23,500, then a back-dated entry
-- ---------------------------------------------------------------------------
with r as (
  insert into public.registers (org_id, name, opening_balance, opening_date)
  values (current_setting('t.org')::uuid, 'Zakat Fund', 53650.00, pg_temp.today() - 400) returning id
) select set_config('t.reg', (select id::text from r), true);
select is((select balance from public.registers_overview where id = current_setting('t.reg')::uuid), 53650.00::numeric, 'a new register starts at its opening balance');

select set_config('t.e1', public.add_register_entry(current_setting('t.reg')::uuid, pg_temp.today() - 20, '  Zakat received  ', 'in', 1000000.00)::text, true);
select set_config('t.e2', public.add_register_entry(current_setting('t.reg')::uuid, pg_temp.today() - 10, 'Amjad medical', 'out', 23500.00)::text, true);
select is(pg_temp.balances(current_setting('t.reg')::uuid), '1053650.00 1030150.00', 'running balance: 53,650 + 1,000,000, then - 23,500');
select is((select description from public.register_ledger(current_setting('t.reg')::uuid) where entry_id = current_setting('t.e1')::uuid),
          'Zakat received', 'the description is trimmed');

select set_config('t.e3', public.add_register_entry(current_setting('t.reg')::uuid, pg_temp.today() - 15, 'Misc person', 'out', 500.00)::text, true);
select is(pg_temp.balances(current_setting('t.reg')::uuid), '1053650.00 1053150.00 1029650.00',
          'a back-dated entry changes the later lines and not the earlier one');
select is((select row(total_in, total_out, balance, entry_count)::text from public.registers_overview where id = current_setting('t.reg')::uuid),
          '(1000000.00,24000.00,1029650.00,3)', 'overview: total in, total out, balance and number of entries agree with the ledger');
select is((select max(last_entry_date) from public.registers_overview where id = current_setting('t.reg')::uuid), pg_temp.today() - 10, 'overview: date of the last entry');

-- Correct 23,500 -> 25,000: the original stays, voided, pointing at the new line.
select set_config('t.e2b', public.correct_register_entry(current_setting('t.e2')::uuid, pg_temp.today() - 10, 'Amjad medical', 'out', 25000.00, ' wrong amount ')::text, true);
select is((select row(voided_at is not null, replaced_by_id = current_setting('t.e2b')::uuid, void_reason, voided_by)::text
           from public.register_entries where id = current_setting('t.e2')::uuid),
          '(t,t,"wrong amount",0e180000-0000-0000-0000-000000000001)', 'correcting voids the original, links the new line and keeps who and why');
select is(pg_temp.balances(current_setting('t.reg')::uuid), '1053650.00 1053150.00 1053150.00 1028150.00',
          'the voided line carries the balance without itself; the new line counts');
select is((select replaces_id from public.register_ledger(current_setting('t.reg')::uuid) where entry_id = current_setting('t.e2b')::uuid),
          current_setting('t.e2')::uuid, 'the ledger tells which line a correction replaces');
select is((select balance from public.registers_overview where id = current_setting('t.reg')::uuid), 1028150.00::numeric, 'overview counts only live entries');

-- Void 500 (no replacement).
select public.void_register_entry(current_setting('t.e3')::uuid, null);
select is((select row(voided_at is not null, replaced_by_id is null, void_reason is null)::text from public.register_entries where id = current_setting('t.e3')::uuid),
          '(t,t,t)', 'a plain void marks the line and has no replacement');
select is((select balance from public.registers_overview where id = current_setting('t.reg')::uuid), 1028650.00::numeric, 'a void drops the line from the balance');
select is((select count(*)::int from public.register_ledger(current_setting('t.reg')::uuid)), 4, 'voided lines stay in the ledger');

-- ---------------------------------------------------------------------------
-- Entries are immutable
-- ---------------------------------------------------------------------------
select throws_ok(format('select public.void_register_entry(%L)', current_setting('t.e3')), '22023', 'This entry is already voided.', 'a voided entry cannot be voided again');
select throws_ok(format($$select public.correct_register_entry(%L, current_date, 'x', 'in', 1)$$, current_setting('t.e2')), '22023', 'This entry is already voided.', 'a voided entry cannot be corrected');
select throws_ok(format('update public.register_entries set amount = 1 where id = %L', current_setting('t.e1')), '42501', null, 'no direct update, even for the owner');
select throws_ok(format('delete from public.register_entries where id = %L', current_setting('t.e1')), '42501', null, 'no direct delete, even for the owner');
select throws_ok(format($$insert into public.register_entries (org_id, register_id, entry_date, description, direction, amount) values (%L, %L, current_date, 'x', 'in', 1)$$,
                        current_setting('t.org'), current_setting('t.reg')), '42501', null, 'no direct insert, even for the owner');

reset role;
select throws_ok(format('update public.register_entries set amount = 1 where id = %L', current_setting('t.e1')), '23514',
                 'register entries cannot be edited; correct or void the entry instead', 'the trigger refuses an edit even from a superuser');
select throws_ok(format('update public.register_entries set description = ''x'' where id = %L', current_setting('t.e3')), '23514',
                 'This entry is already voided.', 'a voided entry cannot change at all');
select throws_ok(format('delete from public.register_entries where id = %L', current_setting('t.e1')), '23514',
                 'register entries cannot be deleted; void the entry instead', 'the trigger refuses a delete');
select pg_temp.as_user(1);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Validation, with the exact messages
-- ---------------------------------------------------------------------------
with r as (insert into public.registers (org_id, name) values (current_setting('t.org')::uuid, 'Family loans') returning id)
select set_config('t.reg2', (select id::text from r), true);
create function pg_temp.try(d date, descr text, dir text, amt numeric) returns text language plpgsql as $$
begin
  perform public.add_register_entry(current_setting('t.reg2')::uuid, d, descr, dir, amt);
  return 'ok';
exception when others then return sqlerrm;
end $$;
select is(pg_temp.try(pg_temp.today() + 1, 'x', 'in', 10), 'A register entry cannot be dated in the future.', 'a future date is refused');
select is(pg_temp.try(null, 'x', 'in', 10), 'Enter a date.', 'a missing date is refused');
select is(pg_temp.try(pg_temp.today(), 'x', 'in', 0), 'The amount must be more than 0.', 'a zero amount is refused');
select is(pg_temp.try(pg_temp.today(), 'x', 'in', -5), 'The amount must be more than 0.', 'a negative amount is refused');
select is(pg_temp.try(pg_temp.today(), 'x', 'in', 1.234), 'The amount can have at most 2 decimals.', 'three decimals are refused');
select is(pg_temp.try(pg_temp.today(), '   ', 'in', 1), 'Enter a description of 1 to 200 characters.', 'an empty description is refused');
select is(pg_temp.try(pg_temp.today(), repeat('x', 201), 'in', 1), 'Enter a description of 1 to 200 characters.', 'a 201-character description is refused');
select is(pg_temp.try(pg_temp.today(), repeat('x', 200), 'in', 1), 'ok', 'a 200-character description is accepted');
select is(pg_temp.try(pg_temp.today(), 'x', 'sideways', 1), 'Direction must be in or out.', 'a direction other than in or out is refused');
select is(pg_temp.try(pg_temp.today(), 'today is fine', 'out', 0.01), 'ok', 'today and one paisa are accepted');

-- Names, archive, delete
select throws_ok($$insert into public.registers (org_id, name) values (current_setting('t.org')::uuid, '  zakat FUND ')$$, '23505', null, 'a register name is unique ignoring case and outer spaces');
update public.registers set is_active = false where id = current_setting('t.reg2')::uuid;
select is(pg_temp.try(pg_temp.today(), 'x', 'in', 1), 'This register is archived. Restore it to add entries.', 'an archived register refuses new entries');
select throws_ok(format($$select public.correct_register_entry(%L, current_date, 'x', 'in', 1)$$,
                        (select id from public.register_entries where register_id = current_setting('t.reg2')::uuid limit 1)),
                 '22023', 'This register is archived. Restore it to add entries.', 'an archived register refuses corrections');
update public.registers set is_active = true where id = current_setting('t.reg2')::uuid;
select is(pg_temp.try(pg_temp.today(), 'back again', 'in', 1), 'ok', 'a restored register takes entries again');
select throws_ok(format('delete from public.registers where id = %L', current_setting('t.reg2')), '23503', null, 'a register with entries cannot be deleted');
with r as (insert into public.registers (org_id, name) values (current_setting('t.org')::uuid, 'Empty one') returning id)
select set_config('t.reg3', (select id::text from r), true);
delete from public.registers where id = current_setting('t.reg3')::uuid;
select is((select count(*)::int from public.registers where id = current_setting('t.reg3')::uuid), 0, 'an empty register can be deleted');
select throws_ok($$update public.registers set org_id = gen_random_uuid() where false$$, '42501', null, 'a register''s organization cannot be updated at all');
select throws_ok($$insert into public.registers (org_id, name, created_by) values (current_setting('t.org')::uuid, 'Forged', gen_random_uuid())$$, '42501', null, 'created_by cannot be supplied');

-- ---------------------------------------------------------------------------
-- Isolation from the books, both ways
-- ---------------------------------------------------------------------------
select is(pg_temp.books(), (select b from snap), 'adding, correcting and voiding register entries left every figure of the books unchanged');
create temp table rsnap on commit drop as
  select jsonb_agg(to_jsonb(o) order by o.name) as o, (select jsonb_agg(to_jsonb(l) order by l.entry_date, l.seq) from public.register_ledger(current_setting('t.reg')::uuid) l) as l
  from public.registers_overview o where o.org_id = current_setting('t.org')::uuid;
select pg_temp.post(jsonb_build_object('type', 'expense', 'date', pg_temp.today() - 1, 'amount', '777.00',
  'category_account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '6000')));
select pg_temp.post(jsonb_build_object('type', 'capital', 'date', pg_temp.today() - 1, 'amount', '9999.00'));
select is((select jsonb_agg(to_jsonb(o) order by o.name) from public.registers_overview o where o.org_id = current_setting('t.org')::uuid), (select o from rsnap), 'posting vouchers left every register overview unchanged');
select is((select jsonb_agg(to_jsonb(l) order by l.entry_date, l.seq) from public.register_ledger(current_setting('t.reg')::uuid) l), (select l from rsnap), 'posting vouchers left the ledger unchanged');
select is((select count(*)::int from pg_constraint c
           where c.contype = 'f'
             and ((c.conrelid in ('public.registers'::regclass, 'public.register_entries'::regclass)
                   and c.confrelid not in ('public.registers'::regclass, 'public.register_entries'::regclass, 'public.organizations'::regclass))
               or (c.confrelid in ('public.registers'::regclass, 'public.register_entries'::regclass)
                   and c.conrelid not in ('public.registers'::regclass, 'public.register_entries'::regclass)))),
          0, 'no foreign key joins the registers to anything in the books, in either direction');

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
select pg_temp.as_user(3);
select is((select count(*)::int from public.registers), 2, 'a viewer can read registers');
select is((select count(*)::int from public.register_ledger(current_setting('t.reg')::uuid)), 4, 'a viewer can read a ledger');
select ok((select count(*) from public.registers_overview) = 2, 'a viewer can read the overview');
select throws_ok(format($$select public.add_register_entry(%L, current_date, 'x', 'in', 1)$$, current_setting('t.reg')), '42501', null, 'a viewer cannot add an entry');
select throws_ok(format($$select public.correct_register_entry(%L, current_date, 'x', 'in', 1)$$, current_setting('t.e2b')), '42501', null, 'a viewer cannot correct an entry');
select throws_ok(format('select public.void_register_entry(%L)', current_setting('t.e2b')), '42501', null, 'a viewer cannot void an entry');
select throws_ok($$insert into public.registers (org_id, name) values (current_setting('t.org')::uuid, 'Viewer register')$$, '42501', null, 'a viewer cannot create a register');

select pg_temp.as_user(4);
select lives_ok(format($$select public.add_register_entry(%L, current_date, 'by accountant', 'in', 5)$$, current_setting('t.reg')), 'an accountant can add');
select lives_ok(format($$select public.correct_register_entry(%L, current_date, 'by accountant', 'in', 6, null)$$, current_setting('t.e2b')), 'an accountant can correct');
select lives_ok(format('select public.void_register_entry(%L, ''no longer needed'')', (select id from public.register_entries where description = 'by accountant' and voided_at is null limit 1)), 'an accountant can void');
select lives_ok($$insert into public.registers (org_id, name) values (current_setting('t.org')::uuid, 'Accountant register')$$, 'an accountant can create a register');

-- Another organization's owner sees and does nothing.
select pg_temp.as_user(2);
select public.create_organization('Other Org');
select is((select count(*)::int from public.registers) + (select count(*)::int from public.register_entries)
          + (select count(*)::int from public.registers_overview), 0, 'another organization sees no register, entry or overview row');
select is((select count(*)::int from public.register_ledger(current_setting('t.reg')::uuid)), 0, 'another organization gets an empty ledger');
select throws_ok(format($$select public.add_register_entry(%L, current_date, 'x', 'in', 1)$$, current_setting('t.reg')), '42501', null, 'another organization cannot add an entry');
select throws_ok(format($$select public.correct_register_entry(%L, current_date, 'x', 'in', 1)$$, current_setting('t.e2b')), '42501', null, 'another organization cannot correct an entry');
select throws_ok(format('select public.void_register_entry(%L)', current_setting('t.e2b')), '42501', null, 'another organization cannot void an entry');
select throws_ok(format($$insert into public.registers (org_id, name) values (%L, 'Planted')$$, current_setting('t.org')), '42501', null, 'another organization cannot create a register here');
update public.registers set name = 'Hijacked' where id = current_setting('t.reg')::uuid;
delete from public.registers where id = current_setting('t.reg')::uuid;

select pg_temp.as_user(1);
select is((select name from public.registers where id = current_setting('t.reg')::uuid), 'Zakat Fund', 'another organization could not rename or delete the register');

reset role;
select ok(not has_function_privilege('anon', 'public.add_register_entry(uuid, date, text, text, numeric)', 'execute')
      and not has_function_privilege('anon', 'public.correct_register_entry(uuid, date, text, text, numeric, text)', 'execute')
      and not has_function_privilege('anon', 'public.void_register_entry(uuid, text)', 'execute')
      and not has_function_privilege('anon', 'public.register_ledger(uuid)', 'execute'), 'anon cannot call the register functions');
select ok(not has_table_privilege('anon', 'public.registers', 'select') and not has_table_privilege('anon', 'public.register_entries', 'select')
      and not has_table_privilege('anon', 'public.registers_overview', 'select'), 'anon cannot read the register tables or the overview');
select ok(not has_function_privilege('authenticated', 'public._check_register_entry(uuid, date, text, text, numeric)', 'execute'), 'the entry check is not callable directly');

select * from finish();
rollback;
