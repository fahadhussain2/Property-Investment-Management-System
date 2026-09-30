-- Documents (spec 004): the one-link rule, same-organization links, the RPCs, storage policies, viewers,
-- organization isolation, audit on delete, documents following an edited entry, and restrict on delete.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, instance_id, email, aud, role, email_confirmed_at) values
  ('0d0c0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'o@d.local', 'authenticated', 'authenticated', now()),
  ('0d0c0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'v@d.local', 'authenticated', 'authenticated', now()),
  ('0d0c0000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'x@d.local', 'authenticated', 'authenticated', now());

create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claims',
                    format('{"sub":"0d0c0000-0000-0000-0000-00000000000%s","role":"authenticated"}', n), true)
$$;

-- Org B (owner x) first, then org A (owner o, viewer v).
select pg_temp.as_user(3);
set local role authenticated;
select set_config('t.orgb', public.create_organization('Docs Org B')::text, true);
select pg_temp.as_user(1);
select set_config('t.org', public.create_organization('Docs Org A')::text, true);
insert into public.memberships (org_id, user_id, role) values (current_setting('t.org')::uuid, '0d0c0000-0000-0000-0000-000000000002', 'viewer');
select set_config('t.cash', (select id::text from public.accounts where org_id = current_setting('t.org')::uuid and code = '1000'), true);

create temp table ids (k text primary key, id uuid) on commit drop;
with i as (insert into public.properties (org_id, code, name) values (current_setting('t.org')::uuid, 'DP-25', 'House') returning id)
insert into ids select 'DP-25', id from i;
with i as (insert into public.properties (org_id, code) values (current_setting('t.org')::uuid, 'EMPTY-1') returning id)
insert into ids select 'EMPTY-1', id from i;
with i as (insert into public.parties (org_id, name, roles) values (current_setting('t.org')::uuid, 'Tenant T', '{tenant}') returning id)
insert into ids select 'TT', id from i;
with i as (insert into public.leases (org_id, property_id, party_id, start_date, monthly_rent)
           select current_setting('t.org')::uuid, id, (select id from ids where k = 'TT'), '2026-01-01', 50000 from ids where k = 'DP-25' returning id)
insert into ids select 'L1', id from i;
with i as (insert into public.holdings (org_id, class, code) values (current_setting('t.org')::uuid, 'vehicle', 'CAR-1') returning id)
insert into ids select 'CAR-1', id from i;

create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = $1 $$;
create function pg_temp.post(p jsonb) returns jsonb language sql as $$
  select public.post_voucher(current_setting('t.org')::uuid, p || jsonb_build_object('account_id', current_setting('t.cash')))
$$;
select pg_temp.post('{"type":"capital","date":"2026-01-01","amount":"1000000.00"}');
insert into ids select 'RENT', (pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-01-05',
  'lease_id', pg_temp.id('L1'), 'amount', '50000.00')) ->> 'id')::uuid;
insert into ids select 'RENT-VOID', (pg_temp.post(jsonb_build_object('type', 'rent', 'date', '2026-02-05',
  'lease_id', pg_temp.id('L1'), 'amount', '50000.00')) ->> 'id')::uuid;

-- "Uploads" a file as the current user, the way the Storage API does (RLS applies). Returns the path.
create function pg_temp.upload(org text, doc uuid, fname text, size int default 1234,
                               mime text default 'application/pdf') returns text language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('documents', org || '/' || doc || '/' || fname, auth.uid()::text,
          jsonb_build_object('size', size, 'mimetype', mime))
  returning name
$$;
create function pg_temp.add(doc uuid, link jsonb, fname text default 'deed.pdf') returns uuid language sql as $$
  select public.add_document(current_setting('t.org')::uuid, doc, pg_temp.upload(current_setting('t.org'), doc, fname),
                             'registry', 'Registry of DP-25', link)
$$;

-- Adding ------------------------------------------------------------------------------------------------
insert into ids values ('D1', gen_random_uuid());
select lives_ok(format($$select pg_temp.add(%L, jsonb_build_object('property_id', %L::uuid))$$, pg_temp.id('D1'), pg_temp.id('DP-25')),
  'owner uploads and records a document on a property');
select results_eq(format($$select file_name, mime_type, size_bytes, title, uploaded_by::text from public.documents where id = %L$$, pg_temp.id('D1')),
  $$values ('deed.pdf'::text, 'application/pdf'::text, 1234::bigint, 'Registry of DP-25'::text, '0d0c0000-0000-0000-0000-000000000001'::text)$$,
  'name, type and size come from the stored object; uploader is recorded');
select is((select record_label from public.documents_overview where id = pg_temp.id('D1')), 'DP-25 · House',
  'overview labels the linked property');

-- Title defaults to the file name.
insert into ids values ('D2', gen_random_uuid());
select public.add_document(current_setting('t.org')::uuid, pg_temp.id('D2'),
  pg_temp.upload(current_setting('t.org'), pg_temp.id('D2'), 'agreement.pdf'), 'rent_agreement', '  ', jsonb_build_object('lease_id', pg_temp.id('L1')));
select is((select title from public.documents where id = pg_temp.id('D2')), 'agreement.pdf', 'a blank title falls back to the file name');
insert into ids values ('D2B', gen_random_uuid());
select public.add_document(current_setting('t.org')::uuid, pg_temp.id('D2B'),
  pg_temp.upload(current_setting('t.org'), pg_temp.id('D2B'), 'Sale_deed_DP-25.pdf'), 'sale_agreement', null,
  jsonb_build_object('property_id', pg_temp.id('DP-25')), 'Sale deed DP-25.pdf');
select results_eq(format($$select file_name, title from public.documents where id = %L$$, pg_temp.id('D2B')),
  $$values ('Sale deed DP-25.pdf'::text, 'Sale deed DP-25.pdf'::text)$$, 'the original file name is kept for display and download');
select is((select record_type || '|' || record_label from public.documents_overview where id = pg_temp.id('D2')), 'lease|DP-25 · Tenant T',
  'overview labels the linked lease');

insert into ids values ('D3', gen_random_uuid()), ('D4', gen_random_uuid()), ('D5', gen_random_uuid());
select lives_ok(format($$select pg_temp.add(%L, jsonb_build_object('party_id', %L::uuid), 'cnic.jpg')$$, pg_temp.id('D3'), pg_temp.id('TT')),
  'a document can be linked to a party');
select lives_ok(format($$select pg_temp.add(%L, jsonb_build_object('holding_id', %L::uuid), 'file.pdf')$$, pg_temp.id('D4'), pg_temp.id('CAR-1')),
  'a document can be linked to a holding');
select is((select record_type from public.documents_overview where id = pg_temp.id('D4')), 'vehicle', 'a holding shows its class');
select lives_ok(format($$select pg_temp.add(%L, jsonb_build_object('voucher_id', %L::uuid), 'receipt.jpg')$$, pg_temp.id('D5'), pg_temp.id('RENT')),
  'a receipt can be linked to an entry');

-- Link rules.
select throws_ok(format($$select pg_temp.add(gen_random_uuid(), jsonb_build_object('property_id', %L::uuid, 'party_id', %L::uuid))$$,
  pg_temp.id('DP-25'), pg_temp.id('TT')), '22023', 'a document must be linked to exactly one record', 'two links are rejected');
select throws_ok($$select pg_temp.add(gen_random_uuid(), '{}'::jsonb)$$, '22023', 'a document must be linked to exactly one record', 'no link is rejected');
select throws_ok($$select pg_temp.add(gen_random_uuid(), '{"account_id":"00000000-0000-0000-0000-000000000000"}'::jsonb)$$,
  '22023', 'a document must be linked to exactly one record', 'an unknown link type is rejected');
select throws_ok($$select pg_temp.add(gen_random_uuid(), '{"property_id":"not-a-uuid"}'::jsonb)$$,
  '22023', 'linked record not found', 'a malformed id is rejected');
select throws_ok(format($$insert into public.documents (org_id, category, title, file_name, mime_type, size_bytes, storage_path)
  values (%L, 'other', 't', 'f', 'application/pdf', 1, %L || '/x/f')$$, current_setting('t.org'), current_setting('t.org')),
  '42501', null, 'the table cannot be written directly');

-- The file must exist and sit under this organization and document id.
select throws_ok(format($$select public.add_document(%L, gen_random_uuid(), %L || '/' || gen_random_uuid() || '/missing.pdf', 'other', 'x',
  jsonb_build_object('property_id', %L::uuid))$$, current_setting('t.org'), current_setting('t.org'), pg_temp.id('DP-25')),
  '22023', 'file path does not match this document', 'the path must carry the document id');
insert into ids values ('D6', gen_random_uuid());
select throws_ok(format($$select public.add_document(%L, %L, %L || '/' || %L || '/missing.pdf', 'other', 'x',
  jsonb_build_object('property_id', %L::uuid))$$, current_setting('t.org'), pg_temp.id('D6'), current_setting('t.org'), pg_temp.id('D6'), pg_temp.id('DP-25')),
  '22023', 'file not uploaded', 'a file that was never uploaded cannot be recorded');
select throws_ok(format($$select public.add_document(%L, %L, %L || '/' || %L || '/x.pdf', 'other', 'x',
  jsonb_build_object('property_id', %L::uuid))$$, current_setting('t.org'), pg_temp.id('D6'), current_setting('t.orgb'), pg_temp.id('D6'), pg_temp.id('DP-25')),
  '22023', 'file path does not match this document', 'a file in another organization''s folder cannot be recorded');

-- Reversals carry no documents.
insert into ids select 'VOID-REV', (public.reverse_voucher(pg_temp.id('RENT-VOID'), 'wrong') ->> 'id')::uuid;
select throws_ok(format($$select pg_temp.add(gen_random_uuid(), jsonb_build_object('voucher_id', %L::uuid))$$, pg_temp.id('VOID-REV')),
  '22023', 'linked record not found', 'a reversal entry cannot take documents');

-- Editing and deleting ---------------------------------------------------------------------------------
select lives_ok(format($$select public.update_document(%L, 'Registry (scan)', 'sale_agreement')$$, pg_temp.id('D1')), 'owner edits title and category');
select results_eq(format($$select title, category::text from public.documents where id = %L$$, pg_temp.id('D1')),
  $$values ('Registry (scan)'::text, 'sale_agreement'::text)$$, 'title and category are updated');
select throws_ok(format($$select public.update_document(%L, ' ', 'other')$$, pg_temp.id('D1')), '22023', 'a document needs a title', 'a blank title is rejected');

-- The file can't be removed while its row exists.
-- Removes a file as the current user (RLS applies); returns how many objects went.
select set_config('storage.allow_delete_query', 'true', true);
create function pg_temp.remove(p text) returns int language plpgsql as $$
declare n int;
begin
  delete from storage.objects where bucket_id = 'documents' and name = p;
  get diagnostics n = row_count;
  return n;
end $$;
select is(pg_temp.remove((select storage_path from public.documents where id = pg_temp.id('D2'))), 0,
  'a recorded file cannot be removed from storage');

-- A property with documents can't be deleted.
select throws_ok(format($$delete from public.properties where id = %L$$, pg_temp.id('DP-25')), '23503', null,
  'a property that has documents cannot be deleted');

select set_config('t.d2path', (select storage_path from public.documents where id = pg_temp.id('D2')), true);
select is(public.delete_document(pg_temp.id('D2')), current_setting('t.d2path'), 'delete returns the file path for the client to remove');
select is((select count(*)::int from public.documents where id = pg_temp.id('D2')), 0, 'the row is gone');
select is((select details ->> 'file_name' from public.audit_log where action = 'document_deleted' and org_id = current_setting('t.org')::uuid),
  'agreement.pdf', 'the delete is in the audit log');
select is(pg_temp.remove(current_setting('t.d2path')), 1,
  'once the row is gone the file can be removed');

-- Documents follow an edited entry; a void leaves them on the original ------------------------------
select set_config('t.newrent', (public.edit_voucher(pg_temp.id('RENT'), '{"amount":"55000.00"}') ->> 'id'), true);
select is((select voucher_id::text from public.documents where id = pg_temp.id('D5')), current_setting('t.newrent'),
  'the receipt moves to the replacement entry');
insert into ids values ('D7', gen_random_uuid());
select pg_temp.add(pg_temp.id('D7'), jsonb_build_object('voucher_id', current_setting('t.newrent')::uuid), 'r2.jpg');
select public.reverse_voucher(current_setting('t.newrent')::uuid, 'void');
select is((select voucher_id::text from public.documents where id = pg_temp.id('D7')), current_setting('t.newrent'),
  'a void leaves the documents on the original entry');

select is(public.storage_used(current_setting('t.org')::uuid), (select sum(size_bytes)::bigint from public.documents
  where org_id = current_setting('t.org')::uuid), 'storage used is the sum of document sizes');

insert into ids values ('ORPHAN', gen_random_uuid());
select pg_temp.upload(current_setting('t.org'), pg_temp.id('ORPHAN'), 'orphan.pdf');

-- Viewer --------------------------------------------------------------------------------------------------
select pg_temp.as_user(2);
select is((select count(*)::int from public.documents_overview), 6, 'a viewer sees the organization''s documents');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 7, 'a viewer can read the files (including one with no row)');
select throws_ok(format($$select public.add_document(%L, gen_random_uuid(), 'x', 'other', 'x', jsonb_build_object('property_id', %L::uuid))$$,
  current_setting('t.org'), pg_temp.id('DP-25')), '42501', null, 'a viewer cannot record a document');
select throws_ok(format($$select pg_temp.upload(%L, gen_random_uuid(), 'v.pdf')$$, current_setting('t.org')), '42501', null,
  'a viewer cannot upload a file');
select throws_ok(format($$select public.delete_document(%L)$$, pg_temp.id('D1')), '42501', null, 'a viewer cannot delete a document');
select is(pg_temp.remove(current_setting('t.org') || '/' || pg_temp.id('ORPHAN') || '/orphan.pdf'), 0,
  'a viewer cannot remove a file, even one with no document row');
select throws_ok(format($$select public.update_document(%L, 'x', 'other')$$, pg_temp.id('D1')), '42501', null, 'a viewer cannot edit a document');

-- Another organization -------------------------------------------------------------------------------------
select pg_temp.as_user(3);
select is((select count(*)::int from public.documents_overview), 0, 'org B sees none of org A''s documents');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 0, 'org B cannot read org A''s files');
select throws_ok(format($$select pg_temp.upload(%L, gen_random_uuid(), 'x.pdf')$$, current_setting('t.org')), '42501', null,
  'org B cannot upload into org A''s folder');
select throws_ok(format($$select public.delete_document(%L)$$, pg_temp.id('D1')), '42501', null, 'org B cannot delete org A''s document');
select is(public.storage_used(current_setting('t.org')::uuid), null, 'org B cannot see org A''s storage use');

-- Org B can't point its own document at org A's property, or record org A's file.
insert into ids values ('B1', gen_random_uuid());
select throws_ok(format($$select public.add_document(%L, %L, pg_temp.upload(%L, %L, 'b.pdf'), 'other', 'b', jsonb_build_object('property_id', %L::uuid))$$,
  current_setting('t.orgb'), pg_temp.id('B1'), current_setting('t.orgb'), pg_temp.id('B1'), pg_temp.id('DP-25')),
  '22023', 'linked record not found', 'a document cannot link to another organization''s property');

select * from finish();
rollback;
