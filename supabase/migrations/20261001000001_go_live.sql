-- M7 (go-live): counting rent from the cut-over date.
-- A lease that began before the business started using this system would look years in arrears, because
-- receipts before the cut-over are not recorded here. "Count rent from" moves the first counted due date.
-- Set it to the cut-over month (nothing owed before), or earlier to carry arrears known at cut-over.
alter table public.leases add column rent_counted_from date;
alter table public.leases add constraint leases_rent_counted_from_check
  check (rent_counted_from is null or rent_counted_from >= start_date);

-- rent_roll as in 20260930000001_leases.sql, except that dues are counted from
-- coalesce(rent_counted_from, start_date), rent entered without a lease counts from that date too, and the
-- row returns rent_counted_from. (Return type changes, so drop and recreate; expiring_leases calls it by name.)
drop function public.rent_roll(uuid, date);
create function public.rent_roll(p_org uuid, p_as_of date default null)
returns table (lease_id uuid, property_id uuid, property_code text, property_name text,
               party_id uuid, tenant_name text, start_date date, end_date date, ended_on date,
               monthly_rent numeric, security_deposit numeric, rent_due_day int, status text,
               months_due int, expected numeric, received numeric, arrears numeric,
               months_unpaid int, paid_ahead numeric, deposit_held numeric,
               last_rent_date date, last_rent_amount numeric, days_to_end int,
               rent_counted_from date)
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
           and jl.entry_date between l.count_from and coalesce(l.eff_end, 'infinity'::date))
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
         c.rent_counted_from
  from c
  join properties pr on pr.id = c.property_id
  join parties pa on pa.id = c.party_id
  left join t on t.lid = c.id
  left join last_rent lr on lr.lid = c.id
  order by upper(pr.code), c.start_date desc;
$$;

-- Keep-alive target (keepalive.yml): Supabase pauses free projects after 7 idle days. Anonymous callers can
-- read no table (grants are revoked from anon), so this touches the database and reveals nothing.
create function public.ping() returns timestamptz
language sql stable set search_path = public, pg_temp as $$ select now() $$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
