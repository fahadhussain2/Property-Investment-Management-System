-- Entry tools: preview leaves no trace; voucher_detail respects tenant isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('ffffffff-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@e.local', 'authenticated', 'authenticated', now()),
  ('ffffffff-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'v@e.local', 'authenticated', 'authenticated', now()),
  ('ffffffff-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'x@e.local', 'authenticated', 'authenticated', now());

select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.org', public.create_organization('Entry Org')::text, true);
insert into public.memberships (org_id, user_id, role)
values (current_setting('t.org')::uuid, 'ffffffff-0000-0000-0000-000000000002', 'viewer');
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);
with i as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'DP-25') returning id)
select set_config('t.prop', (select id::text from i), true);
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Buyer B', '{buyer}') returning id)
select set_config('t.buyer', (select id::text from i), true);

-- Property held at cost 10,200,000.
select public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object('type', 'opening', 'date', '2026-01-01',
  'lines', jsonb_build_array(
    jsonb_build_object('account_id', current_setting('t.cash'), 'debit', '1000000.00'),
    jsonb_build_object('account_id', (select id from public.accounts where org_id = current_setting('t.org')::uuid and code = '1200'),
                       'debit', '10200000.00', 'property_id', current_setting('t.prop')))));

select set_config('t.before', (select format('%s/%s/%s',
  (select count(*) from public.vouchers where org_id = current_setting('t.org')::uuid),
  (select count(*) from public.journal_lines where org_id = current_setting('t.org')::uuid),
  (select count(*) from public.audit_log where org_id = current_setting('t.org')::uuid))), true);

-- Preview a sale.
select set_config('t.preview', public.preview_voucher(current_setting('t.org')::uuid, jsonb_build_object(
  'type', 'sale', 'date', '2026-06-01', 'property_id', current_setting('t.prop'), 'party_id', current_setting('t.buyer'),
  'price', '12500000.00', 'received_now', '12500000.00', 'account_id', current_setting('t.cash')))::text, true);

select is(current_setting('t.preview')::jsonb ->> 'profit', '2300000.00', 'preview shows the sale profit');
select is(current_setting('t.preview')::jsonb ->> 'number', 'SAL-0001', 'preview shows the would-be number');
select is(jsonb_array_length(current_setting('t.preview')::jsonb -> 'lines'), 4, 'preview returns the 4 sale lines');
select ok(not (current_setting('t.preview')::jsonb ? 'id'), 'preview does not expose a voucher id');

-- ...and left nothing behind.
select is((select format('%s/%s/%s',
  (select count(*) from public.vouchers where org_id = current_setting('t.org')::uuid),
  (select count(*) from public.journal_lines where org_id = current_setting('t.org')::uuid),
  (select count(*) from public.audit_log where org_id = current_setting('t.org')::uuid))),
  current_setting('t.before'), 'preview leaves no vouchers, lines or audit rows');
select is(public.property_status(current_setting('t.org')::uuid, current_setting('t.prop')::uuid)::text,
          'vacant', 'preview does not change property status');
select is(public.post_voucher(current_setting('t.org')::uuid, jsonb_build_object(
  'type', 'sale', 'date', '2026-06-01', 'property_id', current_setting('t.prop'), 'party_id', current_setting('t.buyer'),
  'price', '12500000.00', 'received_now', '12500000.00', 'account_id', current_setting('t.cash'))) ->> 'number',
  'SAL-0001', 'the real post still gets the first number');

-- Regression (M4 review): previewing a CORRECTION of a sale must work and show the right number,
-- cost and profit, and leave no trace. (Previewing it as a fresh post said "already sold".)
select set_config('t.sale', (select id::text from public.vouchers where org_id = current_setting('t.org')::uuid and number = 'SAL-0001'), true);
select set_config('t.edit', public.preview_edit(current_setting('t.sale')::uuid, '{"price":"13000000.00","received_now":"13000000.00"}')::text, true);
select is(current_setting('t.edit')::jsonb ->> 'number', 'SAL-0003', 'correction preview shows the real number (after the reversal)');
select is(current_setting('t.edit')::jsonb ->> 'profit', '2800000.00', 'correction preview recomputes profit on the full cost');
select is((select status::text from public.vouchers where id = current_setting('t.sale')::uuid), 'posted', 'correction preview leaves the original posted');
select is((select count(*)::int from public.vouchers where org_id = current_setting('t.org')::uuid and type = 'sale'), 1, 'correction preview leaves no new vouchers');

-- Validation errors surface through preview.
select throws_like(
  format($$select public.preview_voucher(%L, '{"type":"capital","amount":"-1","account_id":"%s"}')$$,
         current_setting('t.org'), current_setting('t.cash')),
  '%cannot be negative%', 'preview surfaces validation errors');

-- voucher_detail
select set_config('t.v', (select id::text from public.vouchers where org_id = current_setting('t.org')::uuid and number = 'SAL-0001'), true);
select is(jsonb_array_length(public.voucher_detail(current_setting('t.v')::uuid) -> 'lines'), 4,
          'detail lists the sale lines incl. cost of sale (zero legs are skipped)');
select is(public.voucher_detail(current_setting('t.v')::uuid) -> 'property' ->> 'code', 'DP-25', 'detail names the property');

-- Viewer cannot preview (it would be a write); outsider sees no detail.
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_like(
  format($$select public.preview_voucher(%L, '{"type":"capital","amount":"1","account_id":"%s"}')$$,
         current_setting('t.org'), current_setting('t.cash')),
  '%not a member%', 'viewer cannot preview');
select set_config('request.jwt.claims', '{"sub":"ffffffff-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(public.voucher_detail(current_setting('t.v')::uuid), null, 'outsider gets no voucher detail');
-- Regression (M4 review): an outsider must not learn a voucher number from edit errors.
select throws_like(
  format($$select public.edit_voucher(%L, '{}')$$, current_setting('t.v')),
  '%not a member%', 'outsider editing gets a role error, not the voucher number');

select * from finish();
rollback;
