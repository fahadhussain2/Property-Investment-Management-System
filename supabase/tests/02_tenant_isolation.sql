-- Tenant isolation: members of org A can never read or write org B; viewers are read-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, instance_id, email, aud, role) values
  ('bbbbbbbb-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'a@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'b@test.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'viewer@test.local', 'authenticated', 'authenticated');

-- User B builds org B with some data.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org_b', public.create_organization('Org B')::text, true);
select set_config('t.cash_b', (select id::text from public.accounts
  where org_id = current_setting('t.org_b')::uuid and code = '1000'), true);
insert into public.properties (org_id, code) values (current_setting('t.org_b')::uuid, 'B-1');
insert into public.parties (org_id, name) values (current_setting('t.org_b')::uuid, 'B party');
select public.post_voucher(current_setting('t.org_b')::uuid,
  jsonb_build_object('type', 'capital', 'amount', '500.00', 'account_id', current_setting('t.cash_b')));
insert into public.memberships (org_id, user_id, role)
values (current_setting('t.org_b')::uuid, 'bbbbbbbb-0000-0000-0000-00000000000c', 'viewer');

-- User A (own org A) looks at org B.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('t.org_a', public.create_organization('Org A')::text, true);

select is_empty(format('select 1 from public.organizations where id = %L', current_setting('t.org_b')), 'A cannot see org B');
select is_empty(format('select 1 from public.accounts where org_id = %L', current_setting('t.org_b')), 'A cannot see B accounts');
select is_empty(format('select 1 from public.properties where org_id = %L', current_setting('t.org_b')), 'A cannot see B properties');
select is_empty(format('select 1 from public.parties where org_id = %L', current_setting('t.org_b')), 'A cannot see B parties');
select is_empty(format('select 1 from public.vouchers where org_id = %L', current_setting('t.org_b')), 'A cannot see B vouchers');
select is_empty(format('select 1 from public.journal_lines where org_id = %L', current_setting('t.org_b')), 'A cannot see B journal');
select is_empty(format('select 1 from public.account_balances(%L) where balance <> 0', current_setting('t.org_b')), 'B balances report is empty for A');

select throws_ok(
  format($$insert into public.properties (org_id, code) values (%L, 'HACK')$$, current_setting('t.org_b')),
  '42501', null, 'A cannot insert into org B');
select throws_like(
  format($$select public.post_voucher(%L, '{"type":"capital","amount":"1","account_id":"%s"}')$$,
         current_setting('t.org_b'), current_setting('t.cash_b')),
  '%not a member%', 'A cannot post vouchers into org B');
select throws_ok(
  format($$insert into public.memberships (org_id, user_id, role) values (%L, 'bbbbbbbb-0000-0000-0000-00000000000a', 'owner')$$,
         current_setting('t.org_b')),
  '42501', null, 'A cannot add themselves to org B');

-- Cross-org references are rejected even inside A's own org (composite foreign keys).
select throws_ok(
  format($$select public.post_voucher(%L, '{"type":"capital","amount":"1","account_id":"%s"}')$$,
         current_setting('t.org_a'), current_setting('t.cash_b')),
  '22023', null, 'A cannot move money through a B account');

-- Viewer of org B: reads, cannot write.
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select isnt_empty(format('select 1 from public.vouchers where org_id = %L', current_setting('t.org_b')), 'viewer can read');
select throws_like(
  format($$select public.post_voucher(%L, '{"type":"capital","amount":"1","account_id":"%s"}')$$,
         current_setting('t.org_b'), current_setting('t.cash_b')),
  '%not a member%', 'viewer cannot post');

select * from finish();
rollback;
