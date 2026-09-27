-- Dashboard v2 (spec 002 §4.1): income, expenses, profit and closing cash per calendar month.
--
-- Each month's figures use exactly the income statement's classification (same sign rule, same
-- subtypes), so every row equals income_statement(org, month_start, month_end); pgTAP proves it.
-- One pass over journal_lines, grouped by month. Months with no activity return zeros.
-- "Today" is the organization's date (org_today); p_as_of pins it for tests and evals only.
-- Security definer for speed: RLS on journal_lines calls is_member() once per row (about 10x slower
-- here). Instead membership is checked once, and every read is filtered by p_org AND that check, so
-- a non-member gets all-zero rows, exactly as RLS would give them. Tested cross-org in 10_dashboard.sql.
create function public.monthly_performance(p_org uuid, p_months int default 12, p_as_of date default null)
returns table (month_start date, month_end date, gross_trading_profit numeric, rent_income numeric,
               other_income numeric, total_income numeric, total_expenses numeric, net_profit numeric,
               closing_cash numeric)
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
    select date_trunc('month', jl.entry_date)::date as ms, jl.entry_date < v_first as before, jl.debit - jl.credit as amount
    from journal_lines jl
    join accounts a on a.id = jl.account_id and a.org_id = jl.org_id
    where v_member and jl.org_id = p_org and jl.entry_date <= v_as_of and a.subtype in ('cash', 'bank')
  ),
  opening as (select coalesce(sum(amount), 0) as amt from c where before),
  cm as (select c.ms, sum(amount) as amt from c where not before group by c.ms)
  select m.ms, m.me,
         (coalesce(t.sales, 0) - coalesce(t.cogs, 0))::numeric(18, 2),
         coalesce(t.rent, 0)::numeric(18, 2),
         coalesce(t.other, 0)::numeric(18, 2),
         (coalesce(t.sales, 0) - coalesce(t.cogs, 0) + coalesce(t.rent, 0) + coalesce(t.other, 0))::numeric(18, 2),
         coalesce(t.exp, 0)::numeric(18, 2),
         (coalesce(t.sales, 0) - coalesce(t.cogs, 0) + coalesce(t.rent, 0) + coalesce(t.other, 0) - coalesce(t.exp, 0))::numeric(18, 2),
         ((select amt from opening) + sum(coalesce(cm.amt, 0)) over (order by m.ms))::numeric(18, 2)
  from m
  left join t on t.ms = m.ms
  left join cm on cm.ms = m.ms
  order by m.ms;
end $$;

-- Security definer, so only signed-in users may call it (anon would only ever get zeros).
revoke execute on function public.monthly_performance(uuid, int, date) from public, anon;
grant execute on function public.monthly_performance(uuid, int, date) to authenticated;
