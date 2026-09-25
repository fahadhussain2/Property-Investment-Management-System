-- Derived state and reports. Everything is computed from journal_lines; nothing is stored.
-- All report functions are SECURITY INVOKER, so RLS applies: non-members get empty results.
-- Money values in jsonb are strings with 2 decimals (see web/src/lib/money.ts).

-- ---------------------------------------------------------------------------
-- Property status (spec §3): sold > under_agreement > rented > vacant
-- ---------------------------------------------------------------------------
create function public.property_status(p_org uuid, p_prop uuid, p_as_of date default current_date)
returns public.property_status
language sql stable set search_path = public, pg_temp as $$
  select case
    when exists (
      select 1 from vouchers
      where org_id = p_org and property_id = p_prop and type = 'sale'
        and status = 'posted' and reverses_id is null and date <= p_as_of
    ) then 'sold'
    when (
      select coalesce(sum(jl.credit - jl.debit), 0)
      from journal_lines jl join accounts a on a.id = jl.account_id
      where jl.org_id = p_org and jl.property_id = p_prop and a.system_key = 'advances_buyers'
        and jl.entry_date <= p_as_of
    ) > 0 then 'under_agreement'
    when exists (
      select 1 from leases
      where org_id = p_org and property_id = p_prop and start_date <= p_as_of
        and coalesce(ended_on, end_date, 'infinity'::date) >= p_as_of
    ) then 'rented'
    else 'vacant'
  end::public.property_status;
$$;

-- ---------------------------------------------------------------------------
-- Account balances in natural sign (assets/expenses debit-positive, others credit-positive)
-- ---------------------------------------------------------------------------
create function public.account_balances(p_org uuid, p_as_of date default null)
returns table (account_id uuid, code text, name text, type public.account_type, subtype text,
               system_key text, balance numeric)
language sql stable set search_path = public, pg_temp as $$
  select a.id, a.code, a.name, a.type, a.subtype, a.system_key,
         coalesce(sum(case when a.type in ('asset', 'expense') then jl.debit - jl.credit
                           else jl.credit - jl.debit end), 0)::numeric(18, 2)
  from accounts a
  left join journal_lines jl
    on jl.account_id = a.id and jl.org_id = a.org_id
   and (p_as_of is null or jl.entry_date <= p_as_of)
  where a.org_id = p_org
  group by a.id
  order by a.code;
$$;

-- ---------------------------------------------------------------------------
-- Account ledger (cash book / bank book / any account) with running balance.
-- seq = 0 is the opening balance row.
-- ---------------------------------------------------------------------------
create function public.account_ledger(p_org uuid, p_account uuid, p_from date, p_to date)
returns table (seq bigint, entry_date date, voucher_id uuid, voucher_number text,
               voucher_type public.voucher_type, memo text, property_code text, party_name text,
               debit numeric, credit numeric, balance numeric)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_sign int;
  v_open numeric;
begin
  select case when a.type in ('asset', 'expense') then 1 else -1 end into v_sign
  from accounts a where a.org_id = p_org and a.id = p_account;
  if v_sign is null then
    return;
  end if;
  select coalesce(sum((jl.debit - jl.credit) * v_sign), 0) into v_open
  from journal_lines jl
  where jl.org_id = p_org and jl.account_id = p_account and jl.entry_date < p_from;

  return query
  select 0::bigint, p_from, null::uuid, null::text, null::public.voucher_type, 'Opening balance'::text,
         null::text, null::text, 0::numeric(18, 2), 0::numeric(18, 2), v_open::numeric(18, 2)
  union all
  select row_number() over w, jl.entry_date, v.id, v.number, v.type, coalesce(jl.memo, v.memo),
         pr.code, pa.name, jl.debit, jl.credit,
         (v_open + sum((jl.debit - jl.credit) * v_sign) over w)::numeric(18, 2)
  from journal_lines jl
  join vouchers v on v.id = jl.voucher_id
  left join properties pr on pr.id = coalesce(jl.property_id, v.property_id)
  left join parties pa on pa.id = coalesce(jl.party_id, v.party_id)
  where jl.org_id = p_org and jl.account_id = p_account and jl.entry_date between p_from and p_to
  window w as (order by jl.entry_date, jl.id rows between unbounded preceding and current row)
  order by 1;
end $$;

-- ---------------------------------------------------------------------------
-- Property summary (spec §6.3): cost basis, income, expenses and net profit per property.
-- cost = still-held cost (1200) + cost already moved to COGS on sale.
-- net_profit = (sales - cogs) + rent + other income - expenses. Unrealized gains are excluded.
-- ---------------------------------------------------------------------------
create function public.property_summary(p_org uuid, p_property uuid default null)
returns table (property_id uuid, code text, name text, kind public.property_kind,
               status public.property_status, for_sale boolean, asking_price numeric,
               cost numeric, sale_price numeric, rent_income numeric, other_income numeric,
               expenses numeric, net_profit numeric, roi_pct numeric)
language sql stable set search_path = public, pg_temp as $$
  with t as (
    select jl.property_id,
      sum(case when a.system_key in ('properties', 'cogs') then jl.debit - jl.credit else 0 end) as cost,
      sum(case when a.system_key = 'cogs' then jl.debit - jl.credit else 0 end) as cogs,
      sum(case when a.system_key = 'sales' then jl.credit - jl.debit else 0 end) as sales,
      sum(case when a.system_key = 'rent_income' then jl.credit - jl.debit else 0 end) as rent,
      sum(case when a.type = 'income' and a.subtype not in ('sales', 'rent')
               then jl.credit - jl.debit else 0 end) as other,
      sum(case when a.type = 'expense' and a.subtype <> 'cogs'
               then jl.debit - jl.credit else 0 end) as exp
    from journal_lines jl join accounts a on a.id = jl.account_id
    where jl.org_id = p_org and jl.property_id is not null
      and (p_property is null or jl.property_id = p_property)
    group by jl.property_id
  ), s as (
    select p.id, p.code, p.name, p.kind, p.for_sale, p.asking_price,
           coalesce(t.cost, 0) as cost, coalesce(t.cogs, 0) as cogs, coalesce(t.sales, 0) as sales,
           coalesce(t.rent, 0) as rent, coalesce(t.other, 0) as other, coalesce(t.exp, 0) as exp
    from properties p left join t on t.property_id = p.id
    where p.org_id = p_org and (p_property is null or p.id = p_property)
  )
  select s.id, s.code, s.name, s.kind, public.property_status(p_org, s.id), s.for_sale, s.asking_price,
         s.cost::numeric(18, 2), s.sales::numeric(18, 2), s.rent::numeric(18, 2),
         s.other::numeric(18, 2), s.exp::numeric(18, 2),
         (s.sales - s.cogs + s.rent + s.other - s.exp)::numeric(18, 2),
         case when s.cost > 0
              then round((s.sales - s.cogs + s.rent + s.other - s.exp) / s.cost * 100, 2) end
  from s
  order by upper(s.code);
$$;

-- ---------------------------------------------------------------------------
-- Income statement (spec §6 layout) for a period.
-- ---------------------------------------------------------------------------
create function public.income_statement(p_org uuid, p_from date, p_to date) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with l as (
    select a.code, a.name, a.type, a.subtype, pr.code as property_code,
           case when a.type = 'income' then jl.credit - jl.debit else jl.debit - jl.credit end as amount
    from journal_lines jl
    join accounts a on a.id = jl.account_id
    left join properties pr on pr.id = jl.property_id
    where jl.org_id = p_org and jl.entry_date between p_from and p_to
      and a.type in ('income', 'expense')
  ), t as (
    select coalesce(sum(amount) filter (where subtype = 'sales'), 0) as sales,
           coalesce(sum(amount) filter (where subtype = 'cogs'), 0) as cogs,
           coalesce(sum(amount) filter (where subtype = 'rent'), 0) as rent,
           coalesce(sum(amount) filter (where type = 'income' and subtype not in ('sales', 'rent')), 0) as other,
           coalesce(sum(amount) filter (where subtype = 'property_expense'), 0) as prop_exp,
           coalesce(sum(amount) filter (where subtype = 'selling_expense'), 0) as sell_exp,
           coalesce(sum(amount) filter (where type = 'expense'
                    and subtype not in ('cogs', 'property_expense', 'selling_expense')), 0) as gen_exp
    from l
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'property_sales', t.sales::numeric(18, 2)::text,
    'cost_of_properties_sold', t.cogs::numeric(18, 2)::text,
    'gross_trading_profit', (t.sales - t.cogs)::numeric(18, 2)::text,
    'rent_income', t.rent::numeric(18, 2)::text,
    'rent_income_by_property', (
      select coalesce(jsonb_object_agg(k, amt::numeric(18, 2)::text), '{}')
      from (select coalesce(property_code, '(no property)') as k, sum(amount) as amt
            from l where subtype = 'rent' group by 1 having sum(amount) <> 0) x),
    'other_income', t.other::numeric(18, 2)::text,
    'other_income_by_account', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name,
                                'amount', amt::numeric(18, 2)::text) order by code), '[]')
      from (select code, name, sum(amount) as amt from l
            where type = 'income' and subtype not in ('sales', 'rent')
            group by code, name having sum(amount) <> 0) x),
    'total_income', (t.sales - t.cogs + t.rent + t.other)::numeric(18, 2)::text,
    'property_expenses', t.prop_exp::numeric(18, 2)::text,
    'selling_expenses', t.sell_exp::numeric(18, 2)::text,
    'general_expenses', t.gen_exp::numeric(18, 2)::text,
    'expenses_by_account', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'subtype', subtype,
                                'amount', amt::numeric(18, 2)::text) order by code), '[]')
      from (select code, name, subtype, sum(amount) as amt from l
            where type = 'expense' and subtype <> 'cogs'
            group by code, name, subtype having sum(amount) <> 0) x),
    'total_expenses', (t.prop_exp + t.sell_exp + t.gen_exp)::numeric(18, 2)::text,
    'net_profit', (t.sales - t.cogs + t.rent + t.other - t.prop_exp - t.sell_exp - t.gen_exp)::numeric(18, 2)::text
  )
  from t;
$$;

-- ---------------------------------------------------------------------------
-- Trial balance and balance sheet as of a date.
-- ---------------------------------------------------------------------------
create function public.trial_balance(p_org uuid, p_as_of date default null)
returns table (code text, name text, type public.account_type, debit numeric, credit numeric)
language sql stable set search_path = public, pg_temp as $$
  select a.code, a.name, a.type,
         greatest(sum(jl.debit - jl.credit), 0)::numeric(18, 2),
         greatest(sum(jl.credit - jl.debit), 0)::numeric(18, 2)
  from accounts a
  join journal_lines jl on jl.account_id = a.id and jl.org_id = a.org_id
  where a.org_id = p_org and (p_as_of is null or jl.entry_date <= p_as_of)
  group by a.id
  having sum(jl.debit - jl.credit) <> 0
  order by a.code;
$$;

create function public.balance_sheet(p_org uuid, p_as_of date default current_date) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with b as (select * from public.account_balances(p_org, p_as_of) where balance <> 0),
  totals as (
    select coalesce(sum(balance) filter (where type = 'asset'), 0) as assets,
           coalesce(sum(balance) filter (where type = 'liability'), 0) as liabilities,
           coalesce(sum(balance) filter (where type = 'equity'), 0) as equity,
           coalesce(sum(balance) filter (where type = 'income'), 0)
             - coalesce(sum(balance) filter (where type = 'expense'), 0) as earnings
    from b
  ),
  section as (
    select type, jsonb_agg(jsonb_build_object('code', code, 'name', name,
                                              'amount', balance::text) order by code) as rows
    from b where type in ('asset', 'liability', 'equity') group by type
  )
  select jsonb_build_object(
    'as_of', p_as_of,
    'assets', coalesce((select rows from section where type = 'asset'), '[]'),
    'total_assets', t.assets::numeric(18, 2)::text,
    'liabilities', coalesce((select rows from section where type = 'liability'), '[]'),
    'total_liabilities', t.liabilities::numeric(18, 2)::text,
    'equity', coalesce((select rows from section where type = 'equity'), '[]'),
    'current_earnings', t.earnings::numeric(18, 2)::text,
    'total_equity', (t.equity + t.earnings)::numeric(18, 2)::text,
    'difference', (t.assets - t.liabilities - t.equity - t.earnings)::numeric(18, 2)::text
  )
  from totals t;
$$;

-- Convenience view for the properties register (RLS applies via security_invoker).
create view public.properties_overview with (security_invoker = true) as
  select p.*, public.property_status(p.org_id, p.id) as status
  from public.properties p;
