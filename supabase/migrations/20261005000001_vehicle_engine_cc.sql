-- Vehicles: engine capacity in cc (optional; vehicles only). The form says "Engine cc"; the details page
-- shows "Engine capacity: 1,300 cc".
-- Skills: .claude/skills/tenant-isolation (no new table: holdings keeps its RLS policies)
alter table public.holdings
  add column engine_cc int check (engine_cc between 1 and 20000),
  add constraint holdings_engine_cc_vehicle_only check (class = 'vehicle' or engine_cc is null);

-- holdings_overview selects h.*, which Postgres expands when the view is created, so it is recreated
-- (definition unchanged from 20261003000004_holdings_reports.sql) to include engine_cc. Default privileges
-- give the new view the same grants (authenticated only, never anon); security_invoker keeps RLS.
drop view public.holdings_overview;
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
