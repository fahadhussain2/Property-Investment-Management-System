-- Spec 003 §3, §6, §7, §8: holding status, the registers' overview, per-holding breakdown, valuation at
-- the metal rates, and the income statement's asset gains and vehicle expenses.
-- Security invoker (RLS applies): non-members get empty results. Computed from journal_lines only;
-- market value is information, never posted.

-- held / partly_sold / sold (rule 7: derived, not stored).
create function public.holding_status(p_org uuid, p_holding uuid) returns text
language sql stable set search_path = public, pg_temp as $$
  select case
    when not exists (
      select 1 from vouchers
      where org_id = p_org and holding_id = p_holding and type = 'holding_sale'
        and status = 'posted' and reverses_id is null
    ) then 'held'
    when h.class = 'vehicle' then 'sold'
    when (select coalesce(sum(quantity_g), 0) from journal_lines
          where org_id = p_org and holding_id = p_holding) = 0 then 'sold'
    else 'partly_sold'
  end
  from holdings h where h.org_id = p_org and h.id = p_holding;
$$;

-- One row per holding for the Vehicles / Gold / Silver registers.
--   cost             = cost still held (balance on the class's "at Cost" account)
--   cost_relieved    = cost taken out by sales; total_cost = cost + cost_relieved
--   sale_price       = cost_relieved + realized_gain (Σ sale prices)
--   market_value     = weight ÷ 11.6638038 × latest rate per tola × purity (metals with a rate only)
create view public.holdings_overview with (security_invoker = true) as
  select h.*,
         public.holding_status(h.org_id, h.id) as status,
         t.cost, t.cost_relieved, (t.cost + t.cost_relieved)::numeric(18, 2) as total_cost,
         t.weight_g, t.running_expenses, t.realized_gain,
         (t.cost_relieved + t.realized_gain)::numeric(18, 2) as sale_price,
         r.rate_per_tola, r.rate_date,
         mv.market_value,
         (mv.market_value - t.cost)::numeric(18, 2) as unrealized_gain
  from public.holdings h
  cross join lateral (
    select
      coalesce(sum(jl.debit - jl.credit) filter (where a.subtype = 'holding'), 0)::numeric(18, 2) as cost,
      coalesce(sum(jl.credit - jl.debit) filter (where a.subtype = 'holding' and v.type = 'holding_sale'), 0)::numeric(18, 2)
        as cost_relieved,
      trim_scale(coalesce(sum(jl.quantity_g), 0)) as weight_g,
      coalesce(sum(jl.debit - jl.credit) filter (where a.type = 'expense'), 0)::numeric(18, 2) as running_expenses,
      coalesce(sum(jl.credit - jl.debit) filter (where a.subtype = 'asset_gain'), 0)::numeric(18, 2) as realized_gain
    from public.journal_lines jl
    join public.accounts a on a.id = jl.account_id
    join public.vouchers v on v.id = jl.voucher_id
    where jl.org_id = h.org_id and jl.holding_id = h.id
  ) t
  left join lateral (
    select mr.rate_per_tola, mr.rate_date
    from public.metal_rates mr
    where mr.org_id = h.org_id and mr.metal = h.class and mr.rate_date <= public.org_today(h.org_id)
    order by mr.rate_date desc
    limit 1
  ) r on true
  cross join lateral (
    select case when h.class <> 'vehicle' and r.rate_per_tola is not null
                then round(t.weight_g / 11.6638038 * r.rate_per_tola * h.purity, 2) end as market_value
  ) mv;

-- How a holding's cost and gain are made up (like property_breakdown):
--   sum('cost') = total_cost;  sum('sale') − sum('cost_of_sale') = realized_gain.
-- A reversal is grouped with the entry it reverses, so a voided cost disappears.
create function public.holding_breakdown(p_org uuid, p_holding uuid)
returns table (section text, label text, amount numeric)
language sql stable set search_path = public, pg_temp as $$
  with l as (
    select a.subtype, a.type, a.name as account_name, jl.debit, jl.credit,
           coalesce(o.type, v.type) as vtype,
           case when v.reverses_id is not null then o.memo else v.memo end as vmemo
    from journal_lines jl
    join accounts a on a.id = jl.account_id
    join vouchers v on v.id = jl.voucher_id
    left join vouchers o on o.id = v.reverses_id
    where jl.org_id = p_org and jl.holding_id = p_holding
  ), rows as (
    select 'cost' as section,
           case vtype
             when 'holding_purchase' then 'Purchase price'
             when 'opening' then 'Cost brought forward'
             when 'holding_cost' then coalesce(nullif(trim(vmemo), ''), 'Other costs')
             else 'Adjustments'
           end as label,
           sum(debit - credit) as amount
    from l where subtype = 'holding' and vtype <> 'holding_sale' group by 2
    union all
    select 'sale', 'Sale price', sum(case when subtype = 'holding' then credit - debit else 0 end)
                                 + sum(case when subtype = 'asset_gain' then credit - debit else 0 end)
    from l where vtype = 'holding_sale'
    union all
    select 'cost_of_sale', 'Cost of the item sold', sum(credit - debit)
    from l where subtype = 'holding' and vtype = 'holding_sale'
    union all
    select 'expense', account_name, sum(debit - credit)
    from l where type = 'expense' group by 2
  )
  select section, label, amount::numeric(18, 2)
  from rows
  where amount is not null and amount <> 0
  order by case section when 'cost' then 1 when 'sale' then 2 when 'cost_of_sale' then 3 else 4 end,
           amount desc;
$$;

-- Totals per class as of a date: items held, weight, cost, latest rate and market value.
-- market_value is null for vehicles, and for a metal with weight held but no rate yet (never 0).
create function public.holdings_valuation(p_org uuid, p_as_of date default null)
returns table (class text, items int, weight_g numeric, cost numeric, rate_per_tola numeric,
               rate_date date, market_value numeric)
language sql stable set search_path = public, pg_temp as $$
  with d as (select coalesce(p_as_of, public.org_today(p_org)) as as_of),
  per as (
    select h.id, h.class, h.purity,
           coalesce(sum(jl.debit - jl.credit) filter (where a.subtype = 'holding'), 0) as cost,
           coalesce(sum(jl.quantity_g), 0) as weight_g
    from holdings h
    left join journal_lines jl
      on jl.org_id = h.org_id and jl.holding_id = h.id and jl.entry_date <= (select as_of from d)
    left join accounts a on a.id = jl.account_id
    where h.org_id = p_org
    group by h.id
  ),
  rate as (
    select distinct on (mr.metal) mr.metal, mr.rate_per_tola, mr.rate_date
    from metal_rates mr
    where mr.org_id = p_org and mr.rate_date <= (select as_of from d)
    order by mr.metal, mr.rate_date desc
  )
  select c.class,
         (count(per.id) filter (where per.cost <> 0 or per.weight_g <> 0))::int,
         trim_scale(coalesce(sum(per.weight_g), 0)),
         coalesce(sum(per.cost), 0)::numeric(18, 2),
         r.rate_per_tola, r.rate_date,
         case
           when c.class = 'vehicle' then null
           when coalesce(sum(per.weight_g), 0) = 0 then 0::numeric(18, 2)
           when r.rate_per_tola is null then null
           else coalesce(sum(round(per.weight_g / 11.6638038 * r.rate_per_tola * per.purity, 2)), 0)::numeric(18, 2)
         end
  from (values (1, 'vehicle'), (2, 'gold'), (3, 'silver')) as c (ord, class)
  left join per on per.class = c.class
  left join rate r on r.metal = c.class
  group by c.ord, c.class, r.rate_per_tola, r.rate_date
  order by c.ord;
$$;

-- ---------------------------------------------------------------------------
-- Income statement: adds asset_gains (+ by class) and vehicle_expenses. other_income and
-- total_expenses keep their meaning (they already include these accounts), so monthly_performance and
-- the dashboard still agree; general_expenses no longer includes vehicle expenses.
-- ---------------------------------------------------------------------------
create or replace function public.income_statement(p_org uuid, p_from date, p_to date) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with l as (
    select a.code, a.name, a.type, a.subtype, pr.code as property_code, ho.class as holding_class,
           case when a.type = 'income' then jl.credit - jl.debit else jl.debit - jl.credit end as amount
    from journal_lines jl
    join accounts a on a.id = jl.account_id
    left join properties pr on pr.id = jl.property_id
    left join holdings ho on ho.id = jl.holding_id
    where jl.org_id = p_org and jl.entry_date between p_from and p_to
      and a.type in ('income', 'expense')
  ), t as (
    select coalesce(sum(amount) filter (where subtype = 'sales'), 0) as sales,
           coalesce(sum(amount) filter (where subtype = 'cogs'), 0) as cogs,
           coalesce(sum(amount) filter (where subtype = 'rent'), 0) as rent,
           coalesce(sum(amount) filter (where type = 'income' and subtype not in ('sales', 'rent')), 0) as other,
           coalesce(sum(amount) filter (where subtype = 'asset_gain'), 0) as gains,
           coalesce(sum(amount) filter (where subtype = 'property_expense'), 0) as prop_exp,
           coalesce(sum(amount) filter (where subtype = 'vehicle_expense'), 0) as veh_exp,
           coalesce(sum(amount) filter (where subtype = 'selling_expense'), 0) as sell_exp,
           coalesce(sum(amount) filter (where type = 'expense'
                    and subtype not in ('cogs', 'property_expense', 'vehicle_expense', 'selling_expense')), 0) as gen_exp
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
    'asset_gains', t.gains::numeric(18, 2)::text,
    'asset_gains_by_class', (
      select coalesce(jsonb_object_agg(k, amt::numeric(18, 2)::text), '{}')
      from (select coalesce(holding_class, 'other') as k, sum(amount) as amt
            from l where subtype = 'asset_gain' group by 1 having sum(amount) <> 0) x),
    'total_income', (t.sales - t.cogs + t.rent + t.other)::numeric(18, 2)::text,
    'property_expenses', t.prop_exp::numeric(18, 2)::text,
    'vehicle_expenses', t.veh_exp::numeric(18, 2)::text,
    'selling_expenses', t.sell_exp::numeric(18, 2)::text,
    'general_expenses', t.gen_exp::numeric(18, 2)::text,
    'expenses_by_account', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'subtype', subtype,
                                'amount', amt::numeric(18, 2)::text) order by code), '[]')
      from (select code, name, subtype, sum(amount) as amt from l
            where type = 'expense' and subtype <> 'cogs'
            group by code, name, subtype having sum(amount) <> 0) x),
    'total_expenses', (t.prop_exp + t.veh_exp + t.sell_exp + t.gen_exp)::numeric(18, 2)::text,
    'net_profit', (t.sales - t.cogs + t.rent + t.other - t.prop_exp - t.veh_exp - t.sell_exp - t.gen_exp)::numeric(18, 2)::text
  )
  from t;
$$;
