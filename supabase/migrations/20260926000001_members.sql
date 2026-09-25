-- M2: invitations, member listing, and last-owner protection.
-- Invites need no server or email: the owner shares a link, and the invitee's confirmed email
-- is matched on sign-in by accept_invitations().

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null default 'accountant',
  invited_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id)
);
create unique index invitations_pending_idx on public.invitations (org_id, email) where accepted_at is null;
create index invitations_email_idx on public.invitations (email) where accepted_at is null;

alter table public.invitations enable row level security;
create policy inv_select on public.invitations for select to authenticated
  using (public.has_role(org_id, '{owner}'));
create policy inv_insert on public.invitations for insert to authenticated
  with check (public.has_role(org_id, '{owner}') and accepted_at is null and invited_by = auth.uid());
create policy inv_delete on public.invitations for delete to authenticated
  using (public.has_role(org_id, '{owner}'));
revoke all on public.invitations from anon;

-- Turns the caller's pending invitations into memberships. Only for confirmed emails,
-- otherwise anyone could sign up with an invited address and join.
create function public.accept_invitations() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email text;
  v_n int;
begin
  select lower(email) into v_email
  from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  with accepted as (
    update public.invitations
    set accepted_at = now(), accepted_by = auth.uid()
    where email = v_email and accepted_at is null
    returning org_id, role
  ), added as (
    insert into public.memberships (org_id, user_id, role)
    select org_id, auth.uid(), role from accepted
    on conflict (org_id, user_id) do nothing
    returning 1
  )
  select count(*) into v_n from added;
  return v_n;
end $$;

-- Members with their emails (auth.users is not readable through the API).
create function public.org_members(p_org uuid)
returns table (user_id uuid, email text, role public.member_role, joined_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_org and public.is_member(p_org)
  order by m.created_at;
$$;

-- Organizations the caller belongs to, with their role (RLS applies).
create function public.my_organizations()
returns table (id uuid, name text, currency text, fiscal_year_start_month int, role public.member_role)
language sql stable set search_path = public, pg_temp as $$
  select o.id, o.name, o.currency, o.fiscal_year_start_month, m.role
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by o.created_at;
$$;

-- An organization must always keep at least one owner. Deleting the whole organization is still
-- allowed: the cascade runs after the organization row is gone.
create function public.guard_last_owner() returns trigger
language plpgsql as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (
       select 1 from public.memberships
       where org_id = old.org_id and role = 'owner' and user_id <> old.user_id
     )
     and exists (select 1 from public.organizations where id = old.org_id)
  then
    raise exception 'an organization must keep at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_last_owner
  before update or delete on public.memberships
  for each row execute function public.guard_last_owner();
