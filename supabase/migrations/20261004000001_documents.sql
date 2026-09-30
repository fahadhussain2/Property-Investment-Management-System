-- Spec 004: documents (scans, photos and PDFs) attached to one property, lease, party, holding or entry.
-- Files live in the private Storage bucket `documents` at <org_id>/<document_id>/<safe_file_name>.
-- Documents never touch the books. Writes go only through add_document / update_document / delete_document.
-- Skill: .claude/skills/tenant-isolation

create type public.document_category as enum
  ('registry', 'sale_agreement', 'rent_agreement', 'receipt', 'id_card', 'photo', 'other');

-- ---------------------------------------------------------------------------
-- Documents (spec §3). Exactly one linked record. The composite foreign keys keep the link inside the
-- organization, and `restrict` stops a record with documents from being deleted.
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  category public.document_category not null,
  title text not null check (length(trim(title)) between 1 and 200),
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null unique,
  property_id uuid,
  lease_id uuid,
  party_id uuid,
  holding_id uuid,
  voucher_id uuid,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  check (num_nonnulls(property_id, lease_id, party_id, holding_id, voucher_id) = 1),
  check (storage_path like org_id::text || '/' || id::text || '/_%'),
  foreign key (org_id, property_id) references public.properties (org_id, id) on delete restrict,
  foreign key (org_id, lease_id) references public.leases (org_id, id) on delete restrict,
  foreign key (org_id, party_id) references public.parties (org_id, id) on delete restrict,
  foreign key (org_id, holding_id) references public.holdings (org_id, id) on delete restrict,
  foreign key (org_id, voucher_id) references public.vouchers (org_id, id) on delete restrict
);
create index documents_org_created_idx on public.documents (org_id, created_at desc);
create index documents_property_idx on public.documents (property_id) where property_id is not null;
create index documents_lease_idx on public.documents (lease_id) where lease_id is not null;
create index documents_party_idx on public.documents (party_id) where party_id is not null;
create index documents_holding_idx on public.documents (holding_id) where holding_id is not null;
create index documents_voucher_idx on public.documents (voucher_id) where voucher_id is not null;

alter table public.documents enable row level security;
create policy documents_select on public.documents for select to authenticated
  using (public.is_member(org_id));
-- No write policies: rows are written only by the security-definer RPCs below.
revoke insert, update, delete, truncate on public.documents from authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket and policies (spec §4). The bucket's size and type limits are the real control.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The organization a documents-bucket object belongs to: the first path segment, when the path has the
-- shape <uuid>/<uuid>/<name>. Anything else returns null, so every policy below denies it.
create function public.document_path_org(p_name text) returns uuid
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

create policy documents_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.is_member(public.document_path_org(name)));
create policy documents_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.has_role(public.document_path_org(name), '{owner,accountant}'));
-- A file can be removed only once its documents row is gone (delete_document first, then the object).
create policy documents_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents'
         and public.has_role(public.document_path_org(name), '{owner,accountant}')
         and not exists (select 1 from public.documents d where d.storage_path = objects.name));
-- No update policy: a file is replaced by deleting it and uploading again.

-- ---------------------------------------------------------------------------
-- RPCs (spec §5)
-- ---------------------------------------------------------------------------

-- Records an uploaded file. p_link is one of {"property_id"|"lease_id"|"party_id"|"holding_id"|"voucher_id": uuid}.
-- p_file_name is the original name (shown, and used on download); the path carries a safe version of it.
-- Size and type are read from storage.objects, never trusted from the client.
create function public.add_document(p_org uuid, p_id uuid, p_path text, p_category public.document_category,
                                    p_title text, p_link jsonb, p_file_name text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_obj storage.objects;
  v_key text;
  v_target uuid;
  v_found boolean;
  v_name text;
begin
  perform public.require_role(p_org, '{owner,accountant}');

  if p_link is null or jsonb_typeof(p_link) <> 'object'
     or (select count(*) from jsonb_object_keys(p_link)) <> 1 then
    raise exception 'a document must be linked to exactly one record' using errcode = '22023';
  end if;
  select k into v_key from jsonb_object_keys(p_link) k;
  if v_key not in ('property_id', 'lease_id', 'party_id', 'holding_id', 'voucher_id') then
    raise exception 'a document must be linked to exactly one record' using errcode = '22023';
  end if;
  begin
    v_target := (p_link ->> v_key)::uuid;
  exception when invalid_text_representation then
    v_target := null;
  end;

  -- One message for "missing" and "in another organization", so an outsider learns nothing.
  v_found := case v_key
    when 'property_id' then exists (select 1 from public.properties where org_id = p_org and id = v_target)
    when 'lease_id'    then exists (select 1 from public.leases where org_id = p_org and id = v_target)
    when 'party_id'    then exists (select 1 from public.parties where org_id = p_org and id = v_target)
    when 'holding_id'  then exists (select 1 from public.holdings where org_id = p_org and id = v_target)
    -- A reversal carries no documents: they stay on the entry it reverses.
    when 'voucher_id'  then exists (select 1 from public.vouchers
                                    where org_id = p_org and id = v_target and reverses_id is null)
  end;
  if v_target is null or not v_found then
    raise exception 'linked record not found' using errcode = '22023';
  end if;

  if p_path is null or public.document_path_org(p_path) is distinct from p_org
     or split_part(p_path, '/', 2) <> p_id::text then
    raise exception 'file path does not match this document' using errcode = '22023';
  end if;
  select * into v_obj from storage.objects where bucket_id = 'documents' and name = p_path;
  if not found then
    raise exception 'file not uploaded' using errcode = '22023';
  end if;
  v_name := left(coalesce(nullif(trim(p_file_name), ''), split_part(p_path, '/', 3)), 255);

  insert into public.documents (id, org_id, category, title, file_name, mime_type, size_bytes, storage_path,
                                property_id, lease_id, party_id, holding_id, voucher_id)
  values (p_id, p_org, p_category,
          left(coalesce(nullif(trim(p_title), ''), v_name), 200),
          v_name,
          coalesce(v_obj.metadata ->> 'mimetype', 'application/octet-stream'),
          coalesce((v_obj.metadata ->> 'size')::bigint, 0),
          p_path,
          case when v_key = 'property_id' then v_target end,
          case when v_key = 'lease_id' then v_target end,
          case when v_key = 'party_id' then v_target end,
          case when v_key = 'holding_id' then v_target end,
          case when v_key = 'voucher_id' then v_target end);
  return p_id;
end $$;

-- Title and category only; the file and the link never change.
create function public.update_document(p_id uuid, p_title text, p_category public.document_category) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.documents where id = p_id;
  if not found then
    raise exception 'document not found' using errcode = '22023';
  end if;
  perform public.require_role(v_org, '{owner,accountant}');
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'a document needs a title' using errcode = '22023';
  end if;
  update public.documents set title = trim(p_title), category = p_category where id = p_id;
end $$;

-- Deletes the row and logs it. Returns the storage path: the client removes the file next (the storage
-- delete policy allows that only once the row is gone).
create function public.delete_document(p_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d public.documents;
begin
  select * into d from public.documents where id = p_id;
  if not found then
    raise exception 'document not found' using errcode = '22023';
  end if;
  perform public.require_role(d.org_id, '{owner,accountant}');
  delete from public.documents where id = p_id;
  insert into public.audit_log (org_id, action, voucher_id, details)
  values (d.org_id, 'document_deleted', d.voucher_id,
          jsonb_build_object('title', d.title, 'file_name', d.file_name, 'category', d.category,
                             'storage_path', d.storage_path, 'property_id', d.property_id,
                             'lease_id', d.lease_id, 'party_id', d.party_id, 'holding_id', d.holding_id,
                             'voucher_id', d.voucher_id));
  return d.storage_path;
end $$;

-- Bytes stored by the organization (spec §6, Settings).
create function public.storage_used(p_org uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.is_member(p_org)
              then coalesce((select sum(size_bytes) from public.documents where org_id = p_org), 0)::bigint
         end
$$;

revoke execute on function public.add_document(uuid, uuid, text, public.document_category, text, jsonb, text) from public, anon;
revoke execute on function public.update_document(uuid, text, public.document_category) from public, anon;
revoke execute on function public.delete_document(uuid) from public, anon;
revoke execute on function public.storage_used(uuid) from public, anon;
grant execute on function public.add_document(uuid, uuid, text, public.document_category, text, jsonb, text) to authenticated;
grant execute on function public.update_document(uuid, text, public.document_category) to authenticated;
grant execute on function public.delete_document(uuid) to authenticated;
grant execute on function public.storage_used(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The Documents page and sections (RLS applies via security_invoker). record_type/record_label/record_id
-- describe the linked record for display and links.
-- ---------------------------------------------------------------------------
create view public.documents_overview with (security_invoker = true) as
select d.id, d.org_id, d.category, d.title, d.file_name, d.mime_type, d.size_bytes, d.storage_path,
       d.property_id, d.lease_id, d.party_id, d.holding_id, d.voucher_id, d.uploaded_by, d.created_at,
       case when d.property_id is not null then 'property'
            when d.lease_id is not null then 'lease'
            when d.party_id is not null then 'party'
            when d.holding_id is not null then h.class
            else 'entry' end as record_type,
       coalesce(d.property_id, d.lease_id, d.party_id, d.holding_id, d.voucher_id) as record_id,
       case when d.property_id is not null then p.code || coalesce(' · ' || p.name, '')
            when d.lease_id is not null then lp.code || ' · ' || lt.name
            when d.party_id is not null then pa.name
            when d.holding_id is not null then h.code || coalesce(' · ' || h.name, '')
            else v.number end as record_label
from public.documents d
left join public.properties p on p.id = d.property_id
left join public.leases l on l.id = d.lease_id
left join public.properties lp on lp.id = l.property_id
left join public.parties lt on lt.id = l.party_id
left join public.parties pa on pa.id = d.party_id
left join public.holdings h on h.id = d.holding_id
left join public.vouchers v on v.id = d.voucher_id;
