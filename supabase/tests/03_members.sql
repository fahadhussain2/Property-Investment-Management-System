-- Members & invitations: only owners invite, only confirmed emails accept, one owner always remains.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('cccccccc-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'owner@m.local',    'authenticated', 'authenticated', now()),
  ('cccccccc-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'Staff@M.local',    'authenticated', 'authenticated', now()),
  ('cccccccc-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'unconf@m.local',   'authenticated', 'authenticated', null),
  ('cccccccc-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'outsider@m.local', 'authenticated', 'authenticated', now()),
  ('cccccccc-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'viewer@m.local',   'authenticated', 'authenticated', now());

-- Owner creates an org and invites two people.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Members Org')::text, true);

select lives_ok(
  format($$insert into public.invitations (org_id, email, role) values (%L, 'staff@m.local', 'accountant')$$, current_setting('t.org')),
  'owner can invite');
insert into public.invitations (org_id, email, role) values (current_setting('t.org')::uuid, 'unconf@m.local', 'viewer');
insert into public.invitations (org_id, email, role) values (current_setting('t.org')::uuid, 'viewer@m.local', 'viewer');
select throws_ok(
  format($$insert into public.invitations (org_id, email, invited_by) values (%L, 'spoof@m.local', 'cccccccc-0000-0000-0000-000000000004')$$, current_setting('t.org')),
  '42501', null, 'invited_by cannot be spoofed');
select is((select count(*)::int from public.invitations where org_id = current_setting('t.org')::uuid), 3, 'owner sees invitations');

-- Confirmed invitee accepts (email match is case-insensitive).
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is(public.accept_invitations(), 1, 'confirmed invitee accepts');
select is((select role::text from public.my_organizations() where id = current_setting('t.org')::uuid),
          'accountant', 'invitee gets the invited role');
select throws_ok(
  format($$insert into public.invitations (org_id, email) values (%L, 'x@m.local')$$, current_setting('t.org')),
  '42501', null, 'accountant cannot invite');
select is_empty(format('select 1 from public.invitations where org_id = %L', current_setting('t.org')),
  'accountant cannot see invitations');

-- Unconfirmed email cannot accept.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(public.accept_invitations(), 0, 'unconfirmed email cannot accept');
select is_empty('select 1 from public.my_organizations()', 'unconfirmed user has no organization');

-- A viewer cannot invite.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000005","role":"authenticated"}', true);
select public.accept_invitations();
select throws_ok(
  format($$insert into public.invitations (org_id, email, role) values (%L, 'y@m.local', 'owner')$$, current_setting('t.org')),
  '42501', null, 'viewer cannot invite');

-- The outsider owns a different org: still sees nothing of this one and cannot invite into it.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000004","role":"authenticated"}', true);
select public.create_organization('Outsider Org');
select throws_ok(
  format($$insert into public.invitations (org_id, email, role) values (%L, 'z@m.local', 'owner')$$, current_setting('t.org')),
  '42501', null, 'owner of another org cannot invite into this org');
select is_empty(format('select 1 from public.org_members(%L)', current_setting('t.org')), 'outsider cannot list members');
select is_empty(format('select 1 from public.invitations where org_id = %L', current_setting('t.org')), 'outsider cannot see invitations');

-- Owner view and last-owner protection.
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.org_members(current_setting('t.org')::uuid)), 3, 'owner lists 3 members');
select throws_ok(
  format($$update public.memberships set role = 'viewer' where org_id = %L and user_id = 'cccccccc-0000-0000-0000-000000000001'$$, current_setting('t.org')),
  '23514', null, 'last owner cannot be demoted');
select throws_ok(
  format($$delete from public.memberships where org_id = %L and user_id = 'cccccccc-0000-0000-0000-000000000001'$$, current_setting('t.org')),
  '23514', null, 'last owner cannot be removed');
update public.memberships set role = 'owner'
where org_id = current_setting('t.org')::uuid and user_id = 'cccccccc-0000-0000-0000-000000000002';
select lives_ok(
  format($$update public.memberships set role = 'accountant' where org_id = %L and user_id = 'cccccccc-0000-0000-0000-000000000001'$$, current_setting('t.org')),
  'an owner can step down once another owner exists');

select * from finish();
rollback;
