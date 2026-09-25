-- Tenant isolation: every table is visible only to members of its organization.
-- Journal tables have no write policies: writes go exclusively through security-definer RPCs.
-- Skill: .claude/skills/tenant-isolation

create function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships where org_id = p_org and user_id = auth.uid()
  );
$$;

create function public.has_role(p_org uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role = any (p_roles)
  );
$$;

-- Raises instead of returning false; used at the top of every write RPC.
create function public.require_role(p_org uuid, p_roles public.member_role[]) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role(p_org, p_roles) then
    raise exception 'not a member of this organization with role %', p_roles using errcode = '42501';
  end if;
end $$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.accounts enable row level security;
alter table public.parties enable row level security;
alter table public.properties enable row level security;
alter table public.leases enable row level security;
alter table public.voucher_sequences enable row level security;
alter table public.vouchers enable row level security;
alter table public.journal_lines enable row level security;
alter table public.audit_log enable row level security;

-- Organizations: members read; owners update. Created only via create_organization().
create policy org_select on public.organizations for select to authenticated
  using (public.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.has_role(id, '{owner}')) with check (public.has_role(id, '{owner}'));

-- Memberships: members see co-members; owners manage.
create policy mem_select on public.memberships for select to authenticated
  using (public.is_member(org_id));
create policy mem_insert on public.memberships for insert to authenticated
  with check (public.has_role(org_id, '{owner}'));
create policy mem_update on public.memberships for update to authenticated
  using (public.has_role(org_id, '{owner}')) with check (public.has_role(org_id, '{owner}'));
create policy mem_delete on public.memberships for delete to authenticated
  using (public.has_role(org_id, '{owner}'));

-- Master data: members read; owners/accountants write.
do $$
declare t text;
begin
  foreach t in array array['accounts', 'parties', 'properties', 'leases'] loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(org_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.has_role(org_id, ''{owner,accountant}''))', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated using (public.has_role(org_id, ''{owner,accountant}'')) with check (public.has_role(org_id, ''{owner,accountant}''))', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated using (public.has_role(org_id, ''{owner,accountant}''))', t);
  end loop;
end $$;

-- Ledger: read-only through the API.
create policy vouchers_select on public.vouchers for select to authenticated
  using (public.is_member(org_id));
create policy journal_lines_select on public.journal_lines for select to authenticated
  using (public.is_member(org_id));
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_member(org_id));
-- voucher_sequences: no policies at all (internal).

-- The anonymous role never touches business data.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
