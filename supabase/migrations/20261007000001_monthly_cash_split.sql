-- Dashboard (spec 005 amendment 4): separate Cash and Bank tiles, each with its own 6-month trend line.
-- monthly_performance also returns month-end cash in hand (subtype 'cash') and bank (subtype 'bank');
-- closing_cash stays their sum. Everything else is unchanged from 20261002000001_dashboard.sql.
-- A new result column changes the return type, so the function is dropped and created again.
drop function public.monthly_performance(uuid, int, date);

create function public.monthly_performance(p_org uuid, p_months int default 12, p_as_of date default null)
returns table (month_start date, month_end date, gross_trading_profit numeric, rent_income numeric,
               other_income numeric, total_income numeric, total_expenses numeric, net_profit numeric,
               closing_cash numeric, closing_cash_in_hand numeric, closing_bank numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_member boolean := public.is_member(p_org);
  -- A non-member cannot see the organization, so like RLS they get the UTC date, not its calendar.
  v_as_of date := coalesce(p_as_of, case when v_member then public.org_today(p_org) else (now() at time zone 'UTC')::date end);
  v_last date := date_trunc('month', v_as_of)::date;
  v_first date;
begin
  if p_months is null or p_months < 1 or p_months > 24 then
    raise exception 'months must be between 1 and 24 (got %)', p_months using errcode = '22023';
  end if;
  v_first := (v_last - make_interval(months => p_months - 1))::date;

  return query
  with m as (
    select g::date as ms, least((g + interval '1 month' - interval '1 day')::date, v_as_of) as me
    from generate_series(v_first, v_last, interval '1 month') g
  ),
  l as (
    select date_trunc('month', jl.entry_date)::date as ms, a.type as atype, a.subtype as sub,
           case when a.type = 'income' then jl.credit - jl.debit else jl.debit - jl.credit end as amount
    from journal_lines jl
    join accounts a on a.id = jl.account_id and a.org_id = jl.org_id
    where v_member and jl.org_id = p_org and jl.entry_date between v_first and v_as_of
      and a.type in ('income', 'expense')
  ),
  t as (
    select l.ms,
           coalesce(sum(amount) filter (where sub = 'sales'), 0) as sales,
           coalesce(sum(amount) filter (where sub = 'cogs'), 0) as cogs,
           coalesce(sum(amount) filter (where sub = 'rent'), 0) as rent,
           coalesce(sum(amount) filter (where atype = 'income' and sub not in ('sales', 'rent')), 0) as other,
           coalesce(sum(amount) filter (where atype = 'expense' and sub <> 'cogs'), 0) as exp
    from l group by l.ms
  ),
  c as (
    select date_trunc('month', jl.entry_date)::date as ms, jl.entry_date < v_first as before, a.subtype as sub,
           jl.debit - jl.credit as amount
    from journal_lines jl
    join accounts a on a.id = jl.account_id and a.org_id = jl.org_id
    where v_member and jl.org_id = p_org and jl.entry_date <= v_as_of and a.subtype in ('cash', 'bank')
  ),
  opening as (
    select coalesce(sum(amount) filter (where sub = 'cash'), 0) as hand,
           coalesce(sum(amount) filter (where sub = 'bank'), 0) as bank
    from c where before
  ),
  cm as (
    select c.ms, coalesce(sum(amount) filter (where sub = 'cash'), 0) as hand,
           coalesce(sum(amount) filter (where sub = 'bank'), 0) as bank
    from c where not before group by c.ms
  ),
  r as (
    select m.ms, m.me, t.sales, t.cogs, t.rent, t.other, t.exp,
           (select hand from opening) + sum(coalesce(cm.hand, 0)) over (order by m.ms) as hand,
           (select bank from opening) + sum(coalesce(cm.bank, 0)) over (order by m.ms) as bank
    from m
    left join t on t.ms = m.ms
    left join cm on cm.ms = m.ms
  )
  select r.ms, r.me,
         (coalesce(r.sales, 0) - coalesce(r.cogs, 0))::numeric(18, 2),
         coalesce(r.rent, 0)::numeric(18, 2),
         coalesce(r.other, 0)::numeric(18, 2),
         (coalesce(r.sales, 0) - coalesce(r.cogs, 0) + coalesce(r.rent, 0) + coalesce(r.other, 0))::numeric(18, 2),
         coalesce(r.exp, 0)::numeric(18, 2),
         (coalesce(r.sales, 0) - coalesce(r.cogs, 0) + coalesce(r.rent, 0) + coalesce(r.other, 0) - coalesce(r.exp, 0))::numeric(18, 2),
         (r.hand + r.bank)::numeric(18, 2),
         r.hand::numeric(18, 2),
         r.bank::numeric(18, 2)
  from r
  order by r.ms;
end $$;

-- Security definer, so only signed-in users may call it (anon would only ever get zeros).
revoke execute on function public.monthly_performance(uuid, int, date) from public, anon;
grant execute on function public.monthly_performance(uuid, int, date) to authenticated;
