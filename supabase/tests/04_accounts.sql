-- Chart of accounts management: RPC-only creation, code ranges, and the account guard.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'owner@a.local',  'authenticated', 'authenticated', now()),
  ('dddddddd-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'viewer@a.local', 'authenticated', 'authenticated', now()),
  ('dddddddd-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'other@a.local',  'authenticated', 'authenticated', now());

select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Accounts Org')::text, true);
insert into public.memberships (org_id, user_id, role)
values (current_setting('t.org')::uuid, 'dddddddd-0000-0000-0000-000000000002', 'viewer');

-- Codes are assigned from each kind's range.
select set_config('t.fuel', public.add_category_account(current_setting('t.org')::uuid, 'property_expense', 'Generator fuel')::text, true);
select is((select code from public.accounts where id = current_setting('t.fuel')::uuid), '6040', 'first property expense head gets 6040');
select set_config('t.guard', public.add_category_account(current_setting('t.org')::uuid, 'property_expense', 'Security guard')::text, true);
select is((select code from public.accounts where id = current_setting('t.guard')::uuid), '6041', 'next one gets 6041');
select set_config('t.parking', public.add_category_account(current_setting('t.org')::uuid, 'income', 'Parking fees')::text, true);
select is((select code from public.accounts where id = current_setting('t.parking')::uuid), '4300', 'income heads start at 4300');
select throws_like(
  format($$select public.add_category_account(%L, 'income', 'parking FEES')$$, current_setting('t.org')),
  '%already exists%', 'duplicate names are rejected (case-insensitive)');
select throws_like(
  format($$select public.add_category_account(%L, 'sales', 'Fake sales')$$, current_setting('t.org')),
  '%kind must be%', 'cannot create system-type accounts');

-- Direct inserts are no longer possible.
select throws_ok(
  format($$insert into public.accounts (org_id, code, name, type, subtype, system_key) values (%L, '4001', 'Forged', 'income', 'sales', 'sales2')$$,
         current_setting('t.org')),
  '42501', null, 'direct insert into accounts is rejected');

-- Money accounts still work through their RPC.
select set_config('t.bank', public.add_money_account(current_setting('t.org')::uuid, 'bank', 'Meezan', 'Meezan Bank', '0123')::text, true);
select is((select code from public.accounts where id = current_setting('t.bank')::uuid), '1101', 'bank account gets 1101');

-- System accounts: rename only.
select lives_ok(
  format($$update public.accounts set name = 'Cash' where org_id = %L and code = '1000'$$, current_setting('t.org')),
  'system accounts can be renamed');
select throws_like(
  format($$update public.accounts set is_active = false where org_id = %L and code = '1000'$$, current_setting('t.org')),
  '%only be renamed%', 'system accounts cannot be deactivated');
select throws_like(
  format($$delete from public.accounts where org_id = %L and code = '4100'$$, current_setting('t.org')),
  '%cannot be deleted%', 'system accounts cannot be deleted');
select throws_like(
  format($$update public.accounts set code = '6999' where id = %L$$, current_setting('t.fuel')),
  '%code cannot be changed%', 'codes are immutable');

-- Balances protect deactivation; entries lock the type.
select public.post_voucher(current_setting('t.org')::uuid,
  jsonb_build_object('type', 'capital', 'amount', '1000.00', 'account_id', current_setting('t.bank')));
select throws_like(
  format($$update public.accounts set is_active = false where id = %L$$, current_setting('t.bank')),
  '%bring it to zero%', 'account with a balance cannot be deactivated');
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'expense', 'amount', '10.00',
  'account_id', current_setting('t.bank'), 'category_account_id', current_setting('t.fuel')));
select throws_like(
  format($$update public.accounts set subtype = 'general_expense' where id = %L$$, current_setting('t.fuel')),
  '%type cannot be changed%', 'used account keeps its type');

-- Regression (M3 review): an UNUSED head must not become a fake bank or sales account either.
select throws_like(
  format($$update public.accounts set type = 'asset', subtype = 'bank' where id = %L$$, current_setting('t.parking')),
  '%type cannot be changed%', 'unused income head cannot become a bank account');
select throws_like(
  format($$update public.accounts set subtype = 'sales' where id = %L$$, current_setting('t.parking')),
  '%type cannot be changed%', 'unused income head cannot become a sales account');
select throws_like(
  format($$update public.accounts set type = 'expense' where org_id = %L and code = '4000'$$, current_setting('t.org')),
  '%type cannot be changed%', 'system account type cannot change');
select throws_like(
  format($$update public.accounts set name = 'GENERATOR FUEL' where id = %L$$, current_setting('t.guard')),
  '%already exists%', 'renaming to a duplicate name is rejected');
select set_config('t.unused', public.add_category_account(current_setting('t.org')::uuid, 'general_expense', 'Unused head')::text, true);
select lives_ok(
  format($$update public.accounts set is_active = false where id = %L$$, current_setting('t.unused')),
  'unused zero-balance head can be deactivated');

-- Type/subtype must agree even for the database owner.
reset role;
select throws_ok(
  format($$insert into public.accounts (org_id, code, name, type, subtype) values (%L, '1999', 'Bad', 'asset', 'sales')$$, current_setting('t.org')),
  '23514', null, 'type and subtype must agree');
set local role authenticated;

-- Viewers cannot add heads.
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_like(
  format($$select public.add_category_account(%L, 'income', 'Viewer head')$$, current_setting('t.org')),
  '%not a member%', 'viewer cannot add accounts');

-- The owner of another business cannot add heads here.
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000003","role":"authenticated"}', true);
select public.create_organization('Other Org');
select throws_like(
  format($$select public.add_category_account(%L, 'income', 'Intruder head')$$, current_setting('t.org')),
  '%not a member%', 'owner of another org cannot add accounts here');

select * from finish();
rollback;
