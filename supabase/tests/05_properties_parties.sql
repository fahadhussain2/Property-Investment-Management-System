-- Properties & parties master data: code uniqueness, delete protection, role-based updates.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o1@p.local', 'authenticated', 'authenticated', now()),
  ('eeeeeeee-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'o2@p.local', 'authenticated', 'authenticated', now()),
  ('eeeeeeee-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'v@p.local',  'authenticated', 'authenticated', now()),
  ('eeeeeeee-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'a@p.local',  'authenticated', 'authenticated', now());

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Props Org')::text, true);
insert into public.memberships (org_id, user_id, role)
values (current_setting('t.org')::uuid, 'eeeeeeee-0000-0000-0000-000000000003', 'viewer'),
       (current_setting('t.org')::uuid, 'eeeeeeee-0000-0000-0000-000000000004', 'accountant');
with i as (insert into public.properties (org_id, code, kind) values (current_setting('t.org')::uuid, 'DP-25', 'house') returning id)
select set_config('t.prop', (select id::text from i), true);

select throws_ok(
  format($$insert into public.properties (org_id, code) values (%L, 'dp-25')$$, current_setting('t.org')),
  '23505', null, 'property codes are unique per business, ignoring case');

-- A property that has entries cannot be deleted; one without entries can.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object(
  'type', 'opening', 'lines', jsonb_build_array(jsonb_build_object(
    'account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '1200'),
    'debit', '5000000.00', 'property_id', current_setting('t.prop')))));
select throws_ok(
  format($$delete from public.properties where id = %L$$, current_setting('t.prop')),
  '23503', null, 'property with entries cannot be deleted');
with i as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'TMP') returning id)
select set_config('t.tmp', (select id::text from i), true);
select lives_ok(
  format($$delete from public.properties where id = %L$$, current_setting('t.tmp')),
  'property without entries can be deleted');

-- Listing for sale: accountant/owner yes, viewer no.
select lives_ok(
  format($$update public.properties set for_sale = true, asking_price = 15000000 where id = %L$$, current_setting('t.prop')),
  'owner can list a property for sale');

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000004","role":"authenticated"}', true);
select isnt_empty(
  format($$update public.properties set asking_price = 15000000 where id = %L returning id$$, current_setting('t.prop')),
  'accountant can change the asking price');

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is_empty(
  format($$update public.properties set asking_price = 1 where id = %L returning id$$, current_setting('t.prop')),
  'viewer cannot change a property');
select is((select asking_price from public.properties where id = current_setting('t.prop')::uuid),
          15000000.00::numeric(18, 2), 'asking price unchanged by viewer');

-- Another business can use the same code.
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  format($$insert into public.properties (org_id, code) values (%L, 'DP-25')$$, public.create_organization('Other Org')),
  'the same code can be used by another business');

select * from finish();
rollback;
