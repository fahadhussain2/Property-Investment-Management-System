-- Spec 007 (R1): registers, memo ledgers kept outside the books (a Zakat fund, a family loan book).
-- A register is a list of dated lines, each money in or out, with a running balance. It has its own two tables and
-- never references accounts, vouchers or journal lines (and nothing in the books references it), so no report,
-- balance or dashboard figure can change because of it.
-- Entries are written only through the three functions below and are never edited or deleted: a correction or a
-- void marks the old line and keeps it.
-- Skills: .claude/skills/tenant-isolation (new tables: org_id, RLS, security definer with has_role first,
-- the organization read from the row, cross-org pgTAP)

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (btrim(name) <> '' and length(btrim(name)) <= 60),
  opening_balance numeric(18, 2) not null default 0,
  opening_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (org_id, id)
);
-- No two registers of one business share a name, ignoring case and spaces at the ends.
create unique index registers_name_idx on public.registers (org_id, lower(btrim(name)));

create table public.register_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  register_id uuid not null,
  seq bigint generated always as identity,
  entry_date date not null,
  description text not null check (btrim(description) <> '' and length(description) <= 200),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(18, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  replaced_by_id uuid,
  unique (org_id, id),
  check ((voided_at is null) = (voided_by is null)),
  check (replaced_by_id is null or voided_at is not null),
  -- No action (not restrict) on delete, so deleting an organization can still cascade through both tables;
  -- deleting a register that has entries is refused either way.
  foreign key (org_id, register_id) references public.registers (org_id, id),
  foreign key (org_id, replaced_by_id) references public.register_entries (org_id, id)
);
create index register_entries_ledger_idx on public.register_entries (org_id, register_id, entry_date, seq);

-- ---------------------------------------------------------------------------
-- Row-level security. Registers are master data (owner and accountant write). Entries have no write policy at
-- all: the functions below (security definer, role checked) are the only way in.
-- ---------------------------------------------------------------------------
alter table public.registers enable row level security;
alter table public.register_entries enable row level security;

create policy registers_select on public.registers for select to authenticated
  using (public.is_member(org_id));
create policy registers_insert on public.registers for insert to authenticated
  with check (public.has_role(org_id, '{owner,accountant}'));
create policy registers_update on public.registers for update to authenticated
  using (public.has_role(org_id, '{owner,accountant}')) with check (public.has_role(org_id, '{owner,accountant}'));
create policy registers_delete on public.registers for delete to authenticated
  using (public.has_role(org_id, '{owner,accountant}'));

create policy register_entries_select on public.register_entries for select to authenticated
  using (public.is_member(org_id));

-- created_by is never client-supplied; a register never moves to another organization.
revoke all on public.registers from anon, authenticated;
grant select, delete on public.registers to authenticated;
grant insert (org_id, name, opening_balance, opening_date) on public.registers to authenticated;
grant update (name, opening_balance, opening_date, is_active) on public.registers to authenticated;
revoke all on public.register_entries from anon, authenticated;
grant select on public.register_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Entries are immutable: the only change allowed is live -> voided, once. Nothing is ever deleted (except
-- while the whole organization is being deleted: its cascade runs after the organization row is gone).
-- ---------------------------------------------------------------------------
create function public.guard_register_entry() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.organizations where id = old.org_id) then
      raise exception 'register entries cannot be deleted; void the entry instead' using errcode = '23514';
    end if;
    return old;
  end if;
  if old.voided_at is not null then
    raise exception 'This entry is already voided.' using errcode = '23514';
  end if;
  if new.voided_at is null
     or (new.id, new.org_id, new.register_id, new.seq, new.entry_date, new.description, new.direction, new.amount,
         new.created_at, new.created_by)
        is distinct from
        (old.id, old.org_id, old.register_id, old.seq, old.entry_date, old.description, old.direction, old.amount,
         old.created_at, old.created_by) then
    raise exception 'register entries cannot be edited; correct or void the entry instead' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger register_entries_guard before update or delete on public.register_entries
  for each row execute function public.guard_register_entry();

-- ---------------------------------------------------------------------------
-- Writing entries (spec §4)
-- ---------------------------------------------------------------------------
create function public._check_register_entry(p_org uuid, p_date date, p_description text, p_direction text, p_amount numeric)
returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_description text := btrim(coalesce(p_description, ''));
begin
  if p_date is null then
    raise exception 'Enter a date.' using errcode = '22023';
  end if;
  if p_date > public.org_today(p_org) then
    raise exception 'A register entry cannot be dated in the future.' using errcode = '22023';
  end if;
  if v_description = '' or length(v_description) > 200 then
    raise exception 'Enter a description of 1 to 200 characters.' using errcode = '22023';
  end if;
  if p_direction is null or p_direction not in ('in', 'out') then
    raise exception 'Direction must be in or out.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than 0.' using errcode = '22023';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'The amount can have at most 2 decimals.' using errcode = '22023';
  end if;
  return v_description;
end $$;

create function public.add_register_entry(p_register uuid, p_date date, p_description text, p_direction text, p_amount numeric)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.registers;
  v_description text;
  v_id uuid;
begin
  select * into r from public.registers where id = p_register;
  if not found then
    raise exception 'register not found' using errcode = '22023';
  end if;
  perform public.require_role(r.org_id, '{owner,accountant}');
  if not r.is_active then
    raise exception 'This register is archived. Restore it to add entries.' using errcode = '22023';
  end if;
  v_description := public._check_register_entry(r.org_id, p_date, p_description, p_direction, p_amount);
  insert into public.register_entries (org_id, register_id, entry_date, description, direction, amount)
  values (r.org_id, r.id, p_date, v_description, p_direction, p_amount)
  returning id into v_id;
  return v_id;
end $$;

create function public.correct_register_entry(p_entry uuid, p_date date, p_description text, p_direction text,
                                              p_amount numeric, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e public.register_entries;
  r public.registers;
  v_description text;
  v_id uuid;
begin
  select * into e from public.register_entries where id = p_entry for update;
  if not found then
    raise exception 'register entry not found' using errcode = '22023';
  end if;
  perform public.require_role(e.org_id, '{owner,accountant}');
  select * into r from public.registers where org_id = e.org_id and id = e.register_id;
  if not r.is_active then
    raise exception 'This register is archived. Restore it to add entries.' using errcode = '22023';
  end if;
  if e.voided_at is not null then
    raise exception 'This entry is already voided.' using errcode = '22023';
  end if;
  v_description := public._check_register_entry(e.org_id, p_date, p_description, p_direction, p_amount);
  insert into public.register_entries (org_id, register_id, entry_date, description, direction, amount)
  values (e.org_id, e.register_id, p_date, v_description, p_direction, p_amount)
  returning id into v_id;
  update public.register_entries
     set voided_at = now(), voided_by = auth.uid(), void_reason = nullif(btrim(p_reason), ''), replaced_by_id = v_id
   where id = e.id;
  return v_id;
end $$;

create function public.void_register_entry(p_entry uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e public.register_entries;
  r public.registers;
begin
  select * into e from public.register_entries where id = p_entry for update;
  if not found then
    raise exception 'register entry not found' using errcode = '22023';
  end if;
  perform public.require_role(e.org_id, '{owner,accountant}');
  select * into r from public.registers where org_id = e.org_id and id = e.register_id;
  if not r.is_active then
    raise exception 'This register is archived. Restore it to add entries.' using errcode = '22023';
  end if;
  if e.voided_at is not null then
    raise exception 'This entry is already voided.' using errcode = '22023';
  end if;
  update public.register_entries
     set voided_at = now(), voided_by = auth.uid(), void_reason = nullif(btrim(p_reason), '')
   where id = e.id;
end $$;

revoke execute on function public._check_register_entry(uuid, date, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.add_register_entry(uuid, date, text, text, numeric) from public, anon;
revoke execute on function public.correct_register_entry(uuid, date, text, text, numeric, text) from public, anon;
revoke execute on function public.void_register_entry(uuid, text) from public, anon;
grant execute on function public.add_register_entry(uuid, date, text, text, numeric) to authenticated;
grant execute on function public.correct_register_entry(uuid, date, text, text, numeric, text) to authenticated;
grant execute on function public.void_register_entry(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Derived state (rule 5: nothing stored). RLS applies (security invoker).
-- ---------------------------------------------------------------------------
-- Every entry of a register, voided ones included, oldest first, with the balance after it. A voided line shows
-- the balance as it was, without itself. replaces_id: the voided line this one corrects.
create function public.register_ledger(p_register uuid)
returns table (entry_id uuid, seq bigint, entry_date date, description text, direction text, amount numeric, running_balance numeric,
               created_at timestamptz, created_by uuid, voided_at timestamptz, voided_by uuid, void_reason text,
               replaced_by_id uuid, replaces_id uuid)
language sql stable set search_path = public, pg_temp as $$
  select e.id, e.seq, e.entry_date, e.description, e.direction, e.amount,
         (r.opening_balance + sum(case when e.voided_at is not null then 0
                                       when e.direction = 'in' then e.amount else -e.amount end)
                              over (order by e.entry_date, e.seq rows between unbounded preceding and current row))::numeric(18, 2),
         e.created_at, e.created_by, e.voided_at, e.voided_by, e.void_reason, e.replaced_by_id,
         (select o.id from public.register_entries o where o.org_id = e.org_id and o.replaced_by_id = e.id)
  from public.register_entries e
  join public.registers r on r.org_id = e.org_id and r.id = e.register_id
  where e.register_id = p_register
  order by e.entry_date, e.seq;
$$;
revoke execute on function public.register_ledger(uuid) from public, anon;
grant execute on function public.register_ledger(uuid) to authenticated;

create view public.registers_overview with (security_invoker = true) as
select r.id, r.org_id, r.name, r.opening_balance, r.opening_date, r.is_active, r.created_at,
       coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::numeric(18, 2) as total_in,
       coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::numeric(18, 2) as total_out,
       (r.opening_balance + coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)
                          - coalesce(sum(e.amount) filter (where e.direction = 'out'), 0))::numeric(18, 2) as balance,
       count(e.id)::int as entry_count,
       max(e.entry_date) as last_entry_date
from public.registers r
left join public.register_entries e on e.org_id = r.org_id and e.register_id = r.id and e.voided_at is null
group by r.id;
revoke all on public.registers_overview from anon;
grant select on public.registers_overview to authenticated;
