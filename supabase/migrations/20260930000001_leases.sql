-- M6: leases & rent roll.
-- Leases are master data (written straight to the table under RLS, like properties); no money moves when
-- a lease is created. Rent and deposits are still recorded only through post_voucher (V7/V8).

-- ---------------------------------------------------------------------------
-- Lease rules, enforced for every writer (UI, evals, SQL):
--   * a new lease (or a lease moved to another property) cannot be on a sold property;
--   * leases on the same property never overlap (open-ended = forever);
--   * once entries point at a lease, its property and tenant are fixed (they were copied onto those entries);
--   * the party becomes a tenant (role added if missing).
-- Security invoker: the writer already needs owner/accountant (RLS), and sees every lease of the org.
-- ---------------------------------------------------------------------------
create function public.check_lease() returns trigger
language plpgsql set search_path = public, pg_temp as $$
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

  if exists (
    select 1 from leases l
    where l.org_id = new.org_id and l.property_id = new.property_id and l.id <> new.id
      and daterange(l.start_date, coalesce(l.ended_on, l.end_date), '[]')
          && daterange(new.start_date, coalesce(new.ended_on, new.end_date), '[]')
  ) then
    raise exception 'this property already has a lease for these dates' using errcode = '22023';
  end if;

  update parties set roles = array_append(roles, 'tenant')
  where org_id = new.org_id and id = new.party_id and not ('tenant' = any (roles));
  return new;
end $$;

create trigger leases_check
  before insert or update on public.leases
  for each row execute function public.check_lease();

-- ---------------------------------------------------------------------------
-- Rent roll (spec §6.7) as at a date (default: the organization's today).
--
-- Rent received for a lease = net Rent Income on entries recorded against the lease, plus entries with no
-- lease for the same property and tenant dated inside the lease (older or quick entries).
-- Reversals carry the lease, so voided and corrected rent nets out.
--
-- Rent is due monthly on rent_due_day; the first due date is the first such day on/after the start.
-- Due dates are counted up to the as-of date or the lease's end, whichever comes first.
--   expected = months_due × monthly_rent · arrears = max(expected − received, 0)
--   months_unpaid = ceil(arrears / monthly_rent) · paid_ahead = max(received − expected, 0)
-- Deposit held = net Security Deposits Held on entries for the lease. A deposit entry with no lease belongs to
-- ONE lease of the same property and tenant (the latest one started on/before its date, else the earliest),
-- so a renewal with the same tenant does not count the deposit twice; refunds may come after the lease ends.
-- ---------------------------------------------------------------------------
create function public.rent_roll(p_org uuid, p_as_of date default null)
returns table (lease_id uuid, property_id uuid, property_code text, property_name text,
               party_id uuid, tenant_name text, start_date date, end_date date, ended_on date,
               monthly_rent numeric, security_deposit numeric, rent_due_day int, status text,
               months_due int, expected numeric, received numeric, arrears numeric,
               months_unpaid int, paid_ahead numeric, deposit_held numeric,
               last_rent_date date, last_rent_amount numeric, days_to_end int)
language sql stable set search_path = public, pg_temp as $$
  with d as (select coalesce(p_as_of, public.org_today(p_org)) as as_of),
  l as (
    select le.*, coalesce(le.ended_on, le.end_date) as eff_end,
           make_date(extract(year from le.start_date)::int, extract(month from le.start_date)::int,
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
           and jl.entry_date between l.start_date and coalesce(l.eff_end, 'infinity'::date))
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
           case when l.due_in_start_month >= l.start_date then l.due_in_start_month
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
         (c.eff_end - c.as_of)::int
  from c
  join properties pr on pr.id = c.property_id
  join parties pa on pa.id = c.party_id
  left join t on t.lid = c.id
  left join last_rent lr on lr.lid = c.id
  order by upper(pr.code), c.start_date desc;
$$;

-- Active leases whose end date falls within the next p_days days (dashboard, spec §6.1).
create function public.expiring_leases(p_org uuid, p_days int default 60, p_as_of date default null)
returns table (lease_id uuid, property_id uuid, property_code text, tenant_name text,
               end_date date, days_to_end int, monthly_rent numeric)
language sql stable set search_path = public, pg_temp as $$
  select r.lease_id, r.property_id, r.property_code, r.tenant_name, coalesce(r.ended_on, r.end_date),
         r.days_to_end, r.monthly_rent
  from public.rent_roll(p_org, p_as_of) r
  where r.status = 'active' and r.days_to_end between 0 and p_days
  order by r.days_to_end, upper(r.property_code);
$$;

-- ---------------------------------------------------------------------------
-- Rule 8: an entry with no date is dated by the organization's calendar, not the server's (UTC).
-- Otherwise unchanged from 20260925000004_posting.sql.
-- ---------------------------------------------------------------------------
create or replace function public.post_voucher(p_org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type public.voucher_type;
  v_date date := coalesce(nullif(p ->> 'date', '')::date, public.org_today(p_org));
  v_memo text := p ->> 'memo';
  v_prop uuid := public._uuid(p, 'property_id');
  v_party uuid := public._uuid(p, 'party_id');
  v_lease uuid := public._uuid(p, 'lease_id');
  v_money uuid;
  v_amount numeric;
  v_price numeric;
  v_now numeric;
  v_adv numeric;
  v_bal numeric;
  v_cost numeric;
  v_cat public.accounts;
  v_to uuid;
  v_line jsonb;
  v_dr numeric;
  v_cr numeric;
  v public.vouchers;
  v_result jsonb;
begin
  perform public.require_role(p_org, '{owner,accountant}');
  begin
    v_type := (p ->> 'type')::public.voucher_type;
  exception when others then
    raise exception 'unknown voucher type: %', p ->> 'type' using errcode = '22023';
  end;
  if v_type is null then
    raise exception 'missing field: type' using errcode = '22023';
  end if;

  -- A lease implies its property and tenant.
  if v_lease is not null then
    select property_id, party_id into v_prop, v_party
    from public.leases where org_id = p_org and id = v_lease;
    if not found then
      raise exception 'lease not found' using errcode = '22023';
    end if;
  end if;

  if v_prop is not null and not exists (
    select 1 from public.properties where org_id = p_org and id = v_prop
  ) then
    raise exception 'property not found' using errcode = '22023';
  end if;
  if v_party is not null and not exists (
    select 1 from public.parties where org_id = p_org and id = v_party
  ) then
    raise exception 'party not found' using errcode = '22023';
  end if;

  -- Property-bound types need a property; cost-changing types need an unsold property.
  if v_type in ('purchase', 'property_cost', 'pay_seller', 'buyer_advance', 'sale',
                'receive_buyer', 'rent', 'deposit') and v_prop is null then
    raise exception 'missing field: property_id' using errcode = '22023';
  end if;
  if v_type in ('purchase', 'property_cost', 'buyer_advance', 'sale')
     and public._is_sold(p_org, v_prop) then
    raise exception 'property is already sold' using errcode = '22023';
  end if;
  if v_type in ('pay_seller', 'buyer_advance', 'sale', 'receive_buyer', 'rent', 'deposit')
     and v_party is null then
    raise exception 'missing field: party_id' using errcode = '22023';
  end if;

  case v_type

  -- V1 Purchase: Dr Properties [P] price · Cr money paid_now · Cr Payable to Sellers balance
  when 'purchase' then
    v_price := public._amount(p, 'price');
    v_now := public._amount(p, 'paid_now', false);
    if v_price = 0 then raise exception 'price must be greater than zero' using errcode = '22023'; end if;
    if v_now > v_price then raise exception 'paid_now exceeds price' using errcode = '22023'; end if;
    if v_now < v_price and v_party is null then
      raise exception 'a seller is required when part of the price is unpaid' using errcode = '22023';
    end if;
    if v_now > 0 then v_money := public._money_account(p_org, public._uuid(p, 'account_id')); end if;
    v := public._new_voucher(p_org, v_type, v_date, v_price, v_prop, v_party, null, v_memo, p, null);
    perform public._line(v, public._acct(p_org, 'properties'), v_price, 0, v_prop, v_party);
    perform public._line(v, v_money, 0, v_now);
    perform public._line(v, public._acct(p_org, 'payable_sellers'), 0, v_price - v_now, v_prop, v_party);

  -- V2 Property cost (capitalized): Dr Properties [P] · Cr money
  when 'property_cost' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null);
    perform public._line(v, public._acct(p_org, 'properties'), v_amount, 0, v_prop, v_party);
    perform public._line(v, v_money, 0, v_amount);

  -- V3 Pay seller balance: Dr Payable to Sellers [P,Pty] · Cr money
  when 'pay_seller' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null);
    perform public._line(v, public._acct(p_org, 'payable_sellers'), v_amount, 0, v_prop, v_party);
    perform public._line(v, v_money, 0, v_amount);

  -- V4 Buyer advance / token: Dr money · Cr Advances from Buyers [P,Pty]
  when 'buyer_advance' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null);
    perform public._line(v, v_money, v_amount, 0);
    perform public._line(v, public._acct(p_org, 'advances_buyers'), 0, v_amount, v_prop, v_party);

  -- V5 Sale: Dr money received_now · Dr Advances applied · Dr Receivable balance · Cr Sales price
  --          + Dr Cost of Properties Sold / Cr Properties for the property's full cost balance.
  when 'sale' then
    v_price := public._amount(p, 'price');
    v_now := public._amount(p, 'received_now', false);
    if v_price = 0 then raise exception 'price must be greater than zero' using errcode = '22023'; end if;
    if v_now > 0 then v_money := public._money_account(p_org, public._uuid(p, 'account_id')); end if;

    select coalesce(sum(credit - debit), 0) into v_adv
    from public.journal_lines
    where org_id = p_org and property_id = v_prop and party_id = v_party
      and account_id = public._acct(p_org, 'advances_buyers');
    v_adv := greatest(v_adv, 0);
    v_bal := v_price - v_now - v_adv;
    if v_bal < 0 then
      raise exception 'amount received (%) plus advances (%) exceeds sale price (%)', v_now, v_adv, v_price
        using errcode = '22023';
    end if;

    select coalesce(sum(debit - credit), 0) into v_cost
    from public.journal_lines
    where org_id = p_org and property_id = v_prop and account_id = public._acct(p_org, 'properties');

    v := public._new_voucher(p_org, v_type, v_date, v_price, v_prop, v_party, null, v_memo, p, null);
    perform public._line(v, v_money, v_now, 0);
    perform public._line(v, public._acct(p_org, 'advances_buyers'), v_adv, 0, v_prop, v_party, 'Advance applied');
    perform public._line(v, public._acct(p_org, 'receivable_buyers'), v_bal, 0, v_prop, v_party);
    perform public._line(v, public._acct(p_org, 'sales'), 0, v_price, v_prop, v_party);
    perform public._line(v, public._acct(p_org, 'cogs'), v_cost, 0, v_prop, null, 'Cost of property sold');
    perform public._line(v, public._acct(p_org, 'properties'), 0, v_cost, v_prop, null, 'Cost of property sold');
    update public.properties set for_sale = false where org_id = p_org and id = v_prop;
    v_result := jsonb_build_object('cost', v_cost::numeric(18, 2)::text,
                                   'profit', (v_price - v_cost)::numeric(18, 2)::text);

  -- V6 Receive buyer balance: Dr money · Cr Receivable from Buyers [P,Pty]
  when 'receive_buyer' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null);
    perform public._line(v, v_money, v_amount, 0);
    perform public._line(v, public._acct(p_org, 'receivable_buyers'), 0, v_amount, v_prop, v_party);

  -- V7 Rent received: Dr money · Cr Rent Income [P,Pty]
  when 'rent' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, v_lease,
                             coalesce(v_memo, 'Rent ' || (p ->> 'period')), p, null);
    perform public._line(v, v_money, v_amount, 0);
    perform public._line(v, public._acct(p_org, 'rent_income'), 0, v_amount, v_prop, v_party, p ->> 'period');

  -- V8 Security deposit: received = Dr money · Cr Deposits Held; refunded = the opposite
  when 'deposit' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, v_lease, v_memo, p, null);
    if coalesce(p ->> 'direction', 'received') = 'received' then
      perform public._line(v, v_money, v_amount, 0);
      perform public._line(v, public._acct(p_org, 'deposits_held'), 0, v_amount, v_prop, v_party);
    elsif p ->> 'direction' = 'refunded' then
      perform public._line(v, public._acct(p_org, 'deposits_held'), v_amount, 0, v_prop, v_party);
      perform public._line(v, v_money, 0, v_amount);
    else
      raise exception 'direction must be received or refunded' using errcode = '22023';
    end if;

  -- V9 Expense: Dr expense category [P?] · Cr money
  -- V10 Other income: Dr money · Cr income category [P?]
  when 'expense', 'income' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    select * into v_cat from public.accounts
    where org_id = p_org and id = public._uuid(p, 'category_account_id', true) and is_active;
    if v_cat.id is null
       or (v_type = 'expense' and (v_cat.type <> 'expense' or v_cat.subtype = 'cogs'))
       or (v_type = 'income' and (v_cat.type <> 'income' or v_cat.subtype in ('sales', 'rent'))) then
      raise exception 'choose a valid % category', v_type using errcode = '22023';
    end if;
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null);
    if v_type = 'expense' then
      perform public._line(v, v_cat.id, v_amount, 0, v_prop, v_party);
      perform public._line(v, v_money, 0, v_amount);
    else
      perform public._line(v, v_money, v_amount, 0);
      perform public._line(v, v_cat.id, 0, v_amount, v_prop, v_party);
    end if;

  -- V11 Transfer between money accounts: Dr to · Cr from
  when 'transfer' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v_to := public._money_account(p_org, public._uuid(p, 'to_account_id'));
    if v_to = v_money then raise exception 'from and to accounts must differ' using errcode = '22023'; end if;
    v := public._new_voucher(p_org, v_type, v_date, v_amount, null, null, null, v_memo, p, null);
    perform public._line(v, v_to, v_amount, 0);
    perform public._line(v, v_money, 0, v_amount);

  -- V12 Capital introduced / owner drawings
  when 'capital', 'drawing' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, null, v_party, null, v_memo, p, null);
    if v_type = 'capital' then
      perform public._line(v, v_money, v_amount, 0);
      perform public._line(v, public._acct(p_org, 'capital'), 0, v_amount, null, v_party);
    else
      perform public._line(v, public._acct(p_org, 'drawings'), v_amount, 0, null, v_party);
      perform public._line(v, v_money, 0, v_amount);
    end if;

  -- V13 Opening balances (auto-balanced to Opening Balance Equity)
  -- V14 General journal (must balance on its own)
  -- lines: [{account_id, debit, credit, property_id?, party_id?, memo?}]
  when 'opening', 'journal' then
    if jsonb_typeof(p -> 'lines') <> 'array' or jsonb_array_length(p -> 'lines') = 0 then
      raise exception 'missing field: lines' using errcode = '22023';
    end if;
    select coalesce(sum(public._amount(l, 'debit', false)), 0),
           coalesce(sum(public._amount(l, 'credit', false)), 0)
      into v_dr, v_cr
    from jsonb_array_elements(p -> 'lines') l;
    if v_type = 'journal' and v_dr <> v_cr then
      raise exception 'journal is unbalanced: debit % <> credit %', v_dr, v_cr using errcode = '22023';
    end if;
    v := public._new_voucher(p_org, v_type, v_date, greatest(v_dr, v_cr), null, v_party, null, v_memo, p, null);
    for v_line in select value from jsonb_array_elements(p -> 'lines') loop
      if (public._amount(v_line, 'debit', false) > 0) = (public._amount(v_line, 'credit', false) > 0) then
        raise exception 'each line needs exactly one of debit or credit' using errcode = '22023';
      end if;
      perform public._line(v, public._uuid(v_line, 'account_id', true),
                           public._amount(v_line, 'debit', false), public._amount(v_line, 'credit', false),
                           public._uuid(v_line, 'property_id'), public._uuid(v_line, 'party_id'),
                           v_line ->> 'memo');
    end loop;
    if v_type = 'opening' and v_dr <> v_cr then
      perform public._line(v, public._acct(p_org, 'opening_equity'),
                           greatest(v_cr - v_dr, 0), greatest(v_dr - v_cr, 0));
    end if;
  end case;

  insert into public.audit_log (org_id, action, voucher_id, details)
  values (p_org, 'post', v.id, jsonb_build_object('number', v.number, 'payload', p));

  return jsonb_build_object('id', v.id, 'number', v.number) || coalesce(v_result, '{}');
end $$;
