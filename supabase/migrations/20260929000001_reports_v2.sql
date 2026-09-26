-- M5: party balances/statements and the per-property cost & profit build-up.
-- Security invoker (RLS applies): non-members get empty results. Computed from journal_lines only.

-- The four "between us and a party" accounts. Sign convention for `net`: positive = they owe us.
-- Every one of them moves `net` by (debit - credit): a debit to Receivable means they owe more;
-- a debit to Payable/Advances/Deposits means we owe them less.

create function public.party_balances(p_org uuid)
returns table (party_id uuid, name text, roles text[], receivable numeric, payable numeric,
               advances numeric, deposits numeric, net numeric)
language sql stable set search_path = public, pg_temp as $$
  with t as (
    select jl.party_id,
      sum(case when a.system_key = 'receivable_buyers' then jl.debit - jl.credit else 0 end) as rec,
      sum(case when a.system_key = 'payable_sellers' then jl.credit - jl.debit else 0 end) as pay,
      sum(case when a.system_key = 'advances_buyers' then jl.credit - jl.debit else 0 end) as adv,
      sum(case when a.system_key = 'deposits_held' then jl.credit - jl.debit else 0 end) as dep
    from journal_lines jl
    join accounts a on a.id = jl.account_id
    where jl.org_id = p_org and jl.party_id is not null
      and a.system_key in ('receivable_buyers', 'payable_sellers', 'advances_buyers', 'deposits_held')
    group by jl.party_id
  )
  select p.id, p.name, p.roles,
         coalesce(t.rec, 0)::numeric(18, 2), coalesce(t.pay, 0)::numeric(18, 2),
         coalesce(t.adv, 0)::numeric(18, 2), coalesce(t.dep, 0)::numeric(18, 2),
         (coalesce(t.rec, 0) - coalesce(t.pay, 0) - coalesce(t.adv, 0) - coalesce(t.dep, 0))::numeric(18, 2)
  from parties p
  left join t on t.party_id = p.id
  where p.org_id = p_org
  order by lower(p.name);
$$;

-- Party statement: opening balance (seq 0), then each line on the four party accounts, running `net`.
create function public.party_ledger(p_org uuid, p_party uuid, p_from date, p_to date)
returns table (seq bigint, entry_date date, voucher_id uuid, voucher_number text,
               voucher_type public.voucher_type, memo text, account_name text, property_code text,
               debit numeric, credit numeric, balance numeric)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_open numeric;
begin
  if not exists (select 1 from parties where org_id = p_org and id = p_party) then
    return;
  end if;
  select coalesce(sum(jl.debit - jl.credit), 0) into v_open
  from journal_lines jl join accounts a on a.id = jl.account_id
  where jl.org_id = p_org and jl.party_id = p_party and jl.entry_date < p_from
    and a.system_key in ('receivable_buyers', 'payable_sellers', 'advances_buyers', 'deposits_held');

  return query
  select 0::bigint, p_from, null::uuid, null::text, null::public.voucher_type, 'Opening balance'::text,
         null::text, null::text, 0::numeric(18, 2), 0::numeric(18, 2), v_open::numeric(18, 2)
  union all
  select row_number() over w, jl.entry_date, v.id, v.number, v.type, coalesce(jl.memo, v.memo),
         a.name, pr.code, jl.debit, jl.credit,
         (v_open + sum(jl.debit - jl.credit) over w)::numeric(18, 2)
  from journal_lines jl
  join accounts a on a.id = jl.account_id
  join vouchers v on v.id = jl.voucher_id
  left join properties pr on pr.id = coalesce(jl.property_id, v.property_id)
  where jl.org_id = p_org and jl.party_id = p_party and jl.entry_date between p_from and p_to
    and a.system_key in ('receivable_buyers', 'payable_sellers', 'advances_buyers', 'deposits_held')
  window w as (order by jl.entry_date, jl.id rows between unbounded preceding and current row)
  order by 1;
end $$;

-- How a property's cost and profit are made up. Rows add up exactly to property_summary:
--   sum(section 'cost')                                  = cost
--   sum('sale') - sum('cost_of_sale') + sum('income') - sum('expense') = net_profit
-- Cost rows exclude the sale's transfer of cost to Cost of Properties Sold (it nets with that
-- account). A reversal is grouped with the entry it reverses, so a voided cost disappears.
create function public.property_breakdown(p_org uuid, p_property uuid)
returns table (section text, label text, amount numeric)
language sql stable set search_path = public, pg_temp as $$
  with l as (
    select a.system_key, a.type, a.subtype, a.name as account_name, jl.debit, jl.credit,
           coalesce(o.type, v.type) as vtype,
           case when v.reverses_id is not null then o.memo else v.memo end as vmemo
    from journal_lines jl
    join accounts a on a.id = jl.account_id
    join vouchers v on v.id = jl.voucher_id
    left join vouchers o on o.id = v.reverses_id
    where jl.org_id = p_org and jl.property_id = p_property
  ), rows as (
    -- Mirrors property_summary.cost = (Properties at Cost) + (Cost of Properties Sold). A sale's own
    -- transfer between the two nets to zero, so sale lines are skipped; any OTHER entry touching
    -- either account (e.g. a journal) is shown as an adjustment.
    select 'cost' as section,
           case when subtype = 'cogs' then 'Adjustments'
                else case vtype
                       when 'purchase' then 'Purchase price'
                       when 'opening' then 'Cost brought forward'
                       when 'property_cost' then coalesce(nullif(trim(vmemo), ''), 'Other costs')
                       else 'Adjustments'
                     end
           end as label,
           sum(debit - credit) as amount
    from l where (system_key = 'properties' or subtype = 'cogs') and vtype <> 'sale' group by 2
    union all
    select 'sale', 'Sale price', sum(credit - debit) from l where subtype = 'sales'
    union all
    select 'cost_of_sale', 'Cost of the property sold', sum(debit - credit) from l where subtype = 'cogs'
    union all
    select 'income', case when subtype = 'rent' then 'Rent income' else account_name end, sum(credit - debit)
    from l where type = 'income' and subtype <> 'sales' group by 2
    union all
    select 'expense', account_name, sum(debit - credit)
    from l where type = 'expense' and subtype <> 'cogs' group by 2
  )
  select section, label, amount::numeric(18, 2)
  from rows
  where amount is not null and amount <> 0
  order by case section when 'cost' then 1 when 'sale' then 2 when 'cost_of_sale' then 3
                        when 'income' then 4 else 5 end, amount desc;
$$;

-- ---------------------------------------------------------------------------
-- Time zones. The database clock is UTC, but a business in Pakistan (UTC+5) records entries dated by
-- ITS calendar: between 00:00 and 05:00 local time, "today's" entries looked like future entries,
-- and a property sold "today" still showed Vacant. Each organization now has a time zone, and
-- property status reflects every recorded entry whatever its date (the date only matters for leases).
-- ---------------------------------------------------------------------------
alter table public.organizations add column timezone text not null default 'Asia/Karachi';

-- Only real IANA zones: an invalid one would make org_today() throw and break every property screen.
create function public.check_org_timezone() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone "%"', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

create trigger organizations_timezone
  before insert or update of timezone on public.organizations
  for each row execute function public.check_org_timezone();

create function public.org_today(p_org uuid) returns date
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_tz text := coalesce((select timezone from organizations where id = p_org), 'UTC');
begin
  return (now() at time zone v_tz)::date;
exception when others then
  return (now() at time zone 'UTC')::date; -- belt and braces: never break a screen over a bad zone
end $$;

-- Balance sheet "as at today" means the business's today (was the server's UTC date).
create or replace function public.balance_sheet(p_org uuid, p_as_of date default null) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with d as (select coalesce(p_as_of, public.org_today(p_org)) as as_of),
  b as (select * from public.account_balances(p_org, (select as_of from d)) where balance <> 0),
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
    'as_of', (select as_of from d),
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

create or replace function public.property_status(p_org uuid, p_prop uuid, p_as_of date default null)
returns public.property_status
language sql stable set search_path = public, pg_temp as $$
  select case
    when exists (
      select 1 from vouchers
      where org_id = p_org and property_id = p_prop and type = 'sale'
        and status = 'posted' and reverses_id is null and (p_as_of is null or date <= p_as_of)
    ) then 'sold'
    when (
      select coalesce(sum(jl.credit - jl.debit), 0)
      from journal_lines jl join accounts a on a.id = jl.account_id
      where jl.org_id = p_org and jl.property_id = p_prop and a.system_key = 'advances_buyers'
        and (p_as_of is null or jl.entry_date <= p_as_of)
    ) > 0 then 'under_agreement'
    when exists (
      select 1 from leases
      where org_id = p_org and property_id = p_prop
        and start_date <= coalesce(p_as_of, public.org_today(p_org))
        and coalesce(ended_on, end_date, 'infinity'::date) >= coalesce(p_as_of, public.org_today(p_org))
    ) then 'rented'
    else 'vacant'
  end::public.property_status;
$$;
