-- Spec 006 (U1): lease rules per unit, rent never counted twice, unit and occupancy in the read models.
-- The books are not touched: post_voucher, edit_voucher, preview_voucher, property_status and every
-- financial report are unchanged.
-- Skills: .claude/skills/tenant-isolation, .claude/skills/accounting-integrity

-- ---------------------------------------------------------------------------
-- Lease rules (spec §4). As in 20260930000001_leases.sql, except the overlap check: two leases on a property
-- conflict when their dates overlap AND one of them is for the whole property or both are for the same unit.
-- A property without units has only whole-property leases, so its rule and message are unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.check_lease() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_conflict text;
begin
  -- Serialise writers per property so two overlapping leases can't slip in concurrently.
  perform pg_advisory_xact_lock(hashtextextended('lease:' || new.property_id::text, 0));

  if tg_op = 'INSERT' or new.property_id <> old.property_id then
    if exists (
      select 1 from vouchers
      where org_id = new.org_id and property_id = new.property_id and type = 'sale'
        and status = 'posted' and reverses_id is null
    ) then
      raise exception 'this property is sold and cannot be rented' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.property_id <> old.property_id or new.party_id <> old.party_id)
     and exists (select 1 from vouchers where lease_id = old.id) then
    raise exception 'entries are recorded against this lease: its property and tenant cannot change'
      using errcode = '22023';
  end if;

  -- A conflict on the same footing (unit vs. same unit, whole vs. whole) is reported first.
  select case
           when l.unit_id is null and new.unit_id is null then 'this property already has a lease for these dates'
           when l.unit_id = new.unit_id then 'this unit already has a lease for these dates'
           when l.unit_id is null then 'the whole property is rented for these dates'
           else 'a unit of this property is rented for these dates'
         end
    into v_conflict
  from leases l
  where l.org_id = new.org_id and l.property_id = new.property_id and l.id <> new.id
    and (l.unit_id is null or new.unit_id is null or l.unit_id = new.unit_id)
    and daterange(l.start_date, coalesce(l.ended_on, l.end_date), '[]')
        && daterange(new.start_date, coalesce(new.ended_on, new.end_date), '[]')
  order by (l.unit_id is not distinct from new.unit_id) desc, l.start_date, l.id
  limit 1;
  if v_conflict is not null then
    raise exception '%', v_conflict using errcode = '22023';
  end if;

  update parties set roles = array_append(roles, 'tenant')
  where org_id = new.org_id and id = new.party_id and not ('tenant' = any (roles));
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Rent or a deposit entered without a lease (spec §5.2): refused when the property and tenant have two or more
-- leases active on the entry's date (one tenant renting two units), because it could belong to either.
-- A trigger, so post_voucher, preview_voucher and edit_voucher all apply it. Reversals are exempt (a void
-- always works). Impossible today: until units exist, a property never has two leases at once.
-- ---------------------------------------------------------------------------
create function public.check_unlinked_rent() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.type in ('rent', 'deposit') and new.lease_id is null and new.reverses_id is null
     and new.property_id is not null and new.party_id is not null
     and (select count(*) from leases l
          where l.org_id = new.org_id and l.property_id = new.property_id and l.party_id = new.party_id
            and l.start_date <= new.date
            and coalesce(l.ended_on, l.end_date, 'infinity'::date) >= new.date) >= 2 then
    raise exception 'this tenant has more than one lease on this property on that date: choose the lease'
      using errcode = '22023';
  end if;
  return new;
end $$;

create trigger vouchers_unlinked_rent
  before insert on public.vouchers
  for each row execute function public.check_unlinked_rent();

-- ---------------------------------------------------------------------------
-- Rent roll as in 20261001000001_go_live.sql, except:
--   * rent entered without a lease counts towards ONE lease (spec §5.1): of the leases with the same property
--     and tenant whose counted period covers the entry date, the one that started first. Until units, there
--     was at most one such lease, so every existing figure is unchanged;
--   * the row returns unit_id and unit_name (appended), and rows sort by property, unit, start date.
-- The return type changes, so drop and recreate; expiring_leases calls it by name and is recreated below.
-- ---------------------------------------------------------------------------
drop function public.rent_roll(uuid, date);
create function public.rent_roll(p_org uuid, p_as_of date default null)
returns table (lease_id uuid, property_id uuid, property_code text, property_name text,
               party_id uuid, tenant_name text, start_date date, end_date date, ended_on date,
               monthly_rent numeric, security_deposit numeric, rent_due_day int, status text,
               months_due int, expected numeric, received numeric, arrears numeric,
               months_unpaid int, paid_ahead numeric, deposit_held numeric,
               last_rent_date date, last_rent_amount numeric, days_to_end int,
               rent_counted_from date, unit_id uuid, unit_name text)
language sql stable set search_path = public, pg_temp as $$
  with d as (select coalesce(p_as_of, public.org_today(p_org)) as as_of),
  l as (
    select le.*, coalesce(le.ended_on, le.end_date) as eff_end,
           coalesce(le.rent_counted_from, le.start_date) as count_from,
           make_date(extract(year from coalesce(le.rent_counted_from, le.start_date))::int,
                     extract(month from coalesce(le.rent_counted_from, le.start_date))::int,
                     le.rent_due_day) as due_in_start_month
    from leases le
    where le.org_id = p_org
  ),
  lines as (
    select l.id as lid, a.system_key, jl.entry_date, jl.debit, jl.credit, v.id as voucher_id,
           v.status as vstatus, v.reverses_id
    from l
    join journal_lines jl on jl.org_id = p_org and jl.property_id = l.property_id and jl.party_id = l.party_id
    join accounts a on a.id = jl.account_id and a.system_key in ('rent_income', 'deposits_held')
    join vouchers v on v.id = jl.voucher_id
    where v.lease_id = l.id
       or (v.lease_id is null and a.system_key = 'rent_income'
           and l.id = (select l2.id from l l2
                       where l2.property_id = l.property_id and l2.party_id = l.party_id
                         and jl.entry_date between l2.count_from and coalesce(l2.eff_end, 'infinity'::date)
                       order by l2.start_date, l2.id
                       limit 1))
       or (v.lease_id is null and a.system_key = 'deposits_held'
           and l.id = (select l2.id from leases l2
                       where l2.org_id = p_org and l2.property_id = l.property_id and l2.party_id = l.party_id
                       order by (l2.start_date <= jl.entry_date) desc,
                                case when l2.start_date <= jl.entry_date then l2.start_date end desc,
                                l2.start_date, l2.id
                       limit 1))
  ),
  t as (
    select lid,
           sum(credit - debit) filter (where system_key = 'rent_income') as received,
           sum(credit - debit) filter (where system_key = 'deposits_held') as deposit_held
    from lines
    where entry_date <= (select as_of from d)
    group by lid
  ),
  last_rent as (
    select distinct on (lid) lid, entry_date, credit - debit as amount
    from lines
    where system_key = 'rent_income' and vstatus = 'posted' and reverses_id is null
      and entry_date <= (select as_of from d)
    order by lid, entry_date desc, voucher_id desc
  ),
  m as (
    select l.*, d.as_of,
           case when l.due_in_start_month >= l.count_from then l.due_in_start_month
                else (l.due_in_start_month + interval '1 month')::date end as first_due,
           least(d.as_of, coalesce(l.eff_end, d.as_of)) as due_until
    from l cross join d
  ),
  c as (
    select m.*,
           case when m.due_until < m.first_due then 0
                else ((extract(year from m.due_until) * 12 + extract(month from m.due_until))
                      - (extract(year from m.first_due) * 12 + extract(month from m.first_due))
                      + case when extract(day from m.due_until) >= m.rent_due_day then 1 else 0 end)::int
           end as n_due
    from m
  )
  select c.id, c.property_id, pr.code, pr.name, c.party_id, pa.name,
         c.start_date, c.end_date, c.ended_on, c.monthly_rent, c.security_deposit, c.rent_due_day,
         case when c.start_date > c.as_of then 'upcoming'
              when c.eff_end < c.as_of then 'ended'
              else 'active' end,
         c.n_due,
         (c.n_due * c.monthly_rent)::numeric(18, 2),
         coalesce(t.received, 0)::numeric(18, 2),
         greatest(c.n_due * c.monthly_rent - coalesce(t.received, 0), 0)::numeric(18, 2),
         ceil(greatest(c.n_due * c.monthly_rent - coalesce(t.received, 0), 0) / c.monthly_rent)::int,
         greatest(coalesce(t.received, 0) - c.n_due * c.monthly_rent, 0)::numeric(18, 2),
         coalesce(t.deposit_held, 0)::numeric(18, 2),
         lr.entry_date, lr.amount::numeric(18, 2),
         (c.eff_end - c.as_of)::int,
         c.rent_counted_from,
         c.unit_id, u.name
  from c
  join properties pr on pr.id = c.property_id
  join parties pa on pa.id = c.party_id
  left join property_units u on u.id = c.unit_id
  left join t on t.lid = c.id
  left join last_rent lr on lr.lid = c.id
  order by upper(pr.code), lower(u.name) nulls first, c.start_date desc;
$$;

-- As in 20260930000001_leases.sql, plus unit_name (appended). Return type changes: drop and recreate.
drop function public.expiring_leases(uuid, int, date);
create function public.expiring_leases(p_org uuid, p_days int default 60, p_as_of date default null)
returns table (lease_id uuid, property_id uuid, property_code text, tenant_name text,
               end_date date, days_to_end int, monthly_rent numeric, unit_name text)
language sql stable set search_path = public, pg_temp as $$
  select r.lease_id, r.property_id, r.property_code, r.tenant_name, coalesce(r.ended_on, r.end_date),
         r.days_to_end, r.monthly_rent, r.unit_name
  from public.rent_roll(p_org, p_as_of) r
  where r.status = 'active' and r.days_to_end between 0 and p_days
  order by r.days_to_end, upper(r.property_code);
$$;

-- ---------------------------------------------------------------------------
-- Units with who rents them today (spec §6). Derived, never stored (rule 7); "today" is the organization's (rule 8).
--   rented          a lease on this unit is active today
--   whole_property  a whole-property lease is active today
--   vacant          neither
-- lease_count: every lease ever on the unit (a unit with leases can't be deleted).
-- ---------------------------------------------------------------------------
create view public.property_units_overview with (security_invoker = true) as
  select u.id, u.org_id, u.property_id, u.name, u.notes, u.created_at,
         case when cur.unit_id is not null then 'rented'
              when cur.id is not null then 'whole_property'
              else 'vacant' end as state,
         cur.id as lease_id, cur.party_id as tenant_id, pa.name as tenant_name, cur.lease_ends,
         (select count(*) from public.leases lc where lc.org_id = u.org_id and lc.unit_id = u.id)::int as lease_count
  from public.property_units u
  left join lateral (
    select l.id, l.unit_id, l.party_id, coalesce(l.ended_on, l.end_date) as lease_ends
    from public.leases l
    where l.org_id = u.org_id and l.property_id = u.property_id
      and (l.unit_id = u.id or l.unit_id is null)
      and l.start_date <= public.org_today(u.org_id)
      and coalesce(l.ended_on, l.end_date, 'infinity'::date) >= public.org_today(u.org_id)
    order by l.unit_id nulls last, l.start_date desc
    limit 1
  ) cur on true
  left join public.parties pa on pa.id = cur.party_id;

-- properties_overview as in 20260925000005_reports.sql, plus occupancy. It selects p.*, which Postgres expands
-- when the view is created, so it is dropped and recreated. Default privileges give it the same grants
-- (authenticated only, never anon); security_invoker keeps RLS.
drop view public.properties_overview;
create view public.properties_overview with (security_invoker = true) as
  select p.*, public.property_status(p.org_id, p.id) as status,
         o.units_total, o.units_vacant
  from public.properties p
  cross join lateral (
    select count(*)::int as units_total, (count(*) filter (where uo.state = 'vacant'))::int as units_vacant
    from public.property_units_overview uo
    where uo.org_id = p.org_id and uo.property_id = p.id
  ) o;

-- documents_overview as in 20261004000001_documents.sql; a lease's label names its unit: "code · unit · tenant".
create or replace view public.documents_overview with (security_invoker = true) as
select d.id, d.org_id, d.category, d.title, d.file_name, d.mime_type, d.size_bytes, d.storage_path,
       d.property_id, d.lease_id, d.party_id, d.holding_id, d.voucher_id, d.uploaded_by, d.created_at,
       case when d.property_id is not null then 'property'
            when d.lease_id is not null then 'lease'
            when d.party_id is not null then 'party'
            when d.holding_id is not null then h.class
            else 'entry' end as record_type,
       coalesce(d.property_id, d.lease_id, d.party_id, d.holding_id, d.voucher_id) as record_id,
       case when d.property_id is not null then p.code || coalesce(' · ' || p.name, '')
            when d.lease_id is not null then lp.code || coalesce(' · ' || lu.name, '') || ' · ' || lt.name
            when d.party_id is not null then pa.name
            when d.holding_id is not null then h.code || coalesce(' · ' || h.name, '')
            else v.number end as record_label
from public.documents d
left join public.properties p on p.id = d.property_id
left join public.leases l on l.id = d.lease_id
left join public.properties lp on lp.id = l.property_id
left join public.property_units lu on lu.id = l.unit_id
left join public.parties lt on lt.id = l.party_id
left join public.parties pa on pa.id = d.party_id
left join public.holdings h on h.id = d.holding_id
left join public.vouchers v on v.id = d.voucher_id;
