-- Spec 008 §4-§5: loans. Loan received (V15) and loan repayment (V16) post to Loans Payable (2300), tagged with the
-- lender; a lender cannot be owed a negative amount; owed per lender is computed from journal_lines (rule 5).
-- post_voucher and _voucher_prefix are replaced in full; their base is 20261003000003_holdings_posting.sql
-- (the only change in each is the loan additions). Skill: .claude/skills/accounting-integrity

-- What the business owes one lender now: sum of credit minus debit on Loans Payable, lines tagged with that lender.
create function public._loan_owed(p_org uuid, p_party uuid) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select coalesce(sum(jl.credit - jl.debit), 0)
  from public.journal_lines jl join public.accounts a on a.id = jl.account_id
  where jl.org_id = p_org and jl.party_id = p_party and a.system_key = 'loans';
$$;
revoke execute on function public._loan_owed(uuid, uuid) from public, anon, authenticated;

create or replace function public._voucher_prefix(t public.voucher_type) returns text
language sql immutable as $$
  select case t
    when 'purchase' then 'PUR' when 'property_cost' then 'PCT' when 'pay_seller' then 'PAY'
    when 'buyer_advance' then 'ADV' when 'sale' then 'SAL' when 'receive_buyer' then 'RCV'
    when 'rent' then 'RNT' when 'deposit' then 'DEP' when 'expense' then 'EXP'
    when 'income' then 'INC' when 'transfer' then 'TRF' when 'capital' then 'CAP'
    when 'drawing' then 'DRW' when 'opening' then 'OPN' when 'journal' then 'JV'
    when 'holding_purchase' then 'HPU' when 'holding_cost' then 'HCO' when 'holding_sale' then 'HSA'
    when 'loan_received' then 'LNR' when 'loan_repayment' then 'LNP'
  end;
$$;

create or replace function public.post_voucher(p_org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type public.voucher_type;
  v_date date := coalesce(nullif(p ->> 'date', '')::date, public.org_today(p_org));
  v_memo text := p ->> 'memo';
  v_prop uuid := public._uuid(p, 'property_id');
  v_party uuid := public._uuid(p, 'party_id');
  v_lease uuid := public._uuid(p, 'lease_id');
  v_hold uuid := public._uuid(p, 'holding_id');
  h public.holdings;
  v_hacct uuid;
  v_metal boolean;
  v_qty numeric;
  v_held numeric;
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
  v_lhold uuid;
  v_lqty numeric;
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
  if v_hold is not null then
    h := public._holding(p_org, v_hold);
    v_metal := h.class <> 'vehicle';
  end if;

  -- Which entries may carry a holding (spec 003 §5).
  if v_hold is not null and v_type not in ('holding_purchase', 'holding_cost', 'holding_sale',
                                           'pay_seller', 'receive_buyer', 'expense') then
    raise exception 'this entry cannot be tagged with a vehicle, gold or silver item' using errcode = '22023';
  end if;
  if v_type in ('holding_purchase', 'holding_cost', 'holding_sale') then
    if v_hold is null then
      raise exception 'missing field: holding_id' using errcode = '22023';
    end if;
    if v_prop is not null or v_lease is not null then
      raise exception 'vehicle, gold and silver entries cannot have a property' using errcode = '22023';
    end if;
    if public._holding_sold(p_org, v_hold) then
      raise exception '% is already sold', h.code using errcode = '22023';
    end if;
    v_hacct := public._holding_account(p_org, h.class);
  end if;
  if v_type in ('pay_seller', 'receive_buyer') and v_prop is not null and v_hold is not null then
    raise exception 'choose a property or a vehicle / gold / silver item, not both' using errcode = '22023';
  end if;
  if v_type = 'expense' and v_hold is not null and h.class <> 'vehicle' then
    raise exception 'only a vehicle can be tagged on an expense' using errcode = '22023';
  end if;

  -- Property-bound types need a property; cost-changing types need an unsold property.
  if (v_type in ('purchase', 'property_cost', 'buyer_advance', 'sale', 'rent', 'deposit')
      or (v_type in ('pay_seller', 'receive_buyer') and v_hold is null)) and v_prop is null then
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

  -- V3 Pay seller balance: Dr Payable to Sellers [P or H, Pty] · Cr money
  when 'pay_seller' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null, v_hold);
    perform public._line(v, public._acct(p_org, 'payable_sellers'), v_amount, 0, v_prop, v_party, null, v_hold, null);
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

  -- V6 Receive buyer balance: Dr money · Cr Receivable from Buyers [P or H, Pty]
  when 'receive_buyer' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null, v_hold);
    perform public._line(v, v_money, v_amount, 0);
    perform public._line(v, public._acct(p_org, 'receivable_buyers'), 0, v_amount, v_prop, v_party, null, v_hold, null);

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

  -- V9 Expense: Dr expense category [P?, vehicle?] · Cr money
  -- V10 Other income: Dr money · Cr income category [P?] (never Gain on Sale of Assets: H3 posts it)
  when 'expense', 'income' then
    v_amount := public._amount(p, 'amount');
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    select * into v_cat from public.accounts
    where org_id = p_org and id = public._uuid(p, 'category_account_id', true) and is_active;
    if v_cat.id is null
       or (v_type = 'expense' and (v_cat.type <> 'expense' or v_cat.subtype = 'cogs'))
       or (v_type = 'income' and (v_cat.type <> 'income' or v_cat.subtype in ('sales', 'rent', 'asset_gain'))) then
      raise exception 'choose a valid % category', v_type using errcode = '22023';
    end if;
    v := public._new_voucher(p_org, v_type, v_date, v_amount, v_prop, v_party, null, v_memo, p, null, v_hold);
    if v_type = 'expense' then
      perform public._line(v, v_cat.id, v_amount, 0, v_prop, v_party, null, v_hold, null);
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

  -- V15 Loan received:  Dr money · Cr Loans Payable [Lender]   (spec 008 §4; never touches profit)
  -- V16 Loan repayment:  Dr Loans Payable [Lender] · Cr money   (at most what is owed to that lender)
  when 'loan_received', 'loan_repayment' then
    v_amount := public._amount(p, 'amount');
    if v_amount = 0 then raise exception 'amount must be greater than zero' using errcode = '22023'; end if;
    if v_date > public.org_today(p_org) then
      raise exception 'A loan entry cannot be dated in the future.' using errcode = '22023';
    end if;
    if v_prop is not null or v_lease is not null then
      raise exception 'a loan cannot have a property' using errcode = '22023';
    end if;
    if not exists (select 1 from public.parties
                    where org_id = p_org and id = v_party and 'lender' = any (roles)) then
      raise exception 'Choose a lender.' using errcode = '22023';
    end if;
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    if v_type = 'loan_repayment' then
      v_bal := public._loan_owed(p_org, v_party);
      if v_amount > v_bal then
        raise exception 'You owe % only % %.',
          (select name from public.parties where id = v_party),
          (select currency from public.organizations where id = p_org),
          to_char(v_bal, 'FM999,999,999,999,990.00') using errcode = '22023';
      end if;
    end if;
    v := public._new_voucher(p_org, v_type, v_date, v_amount, null, v_party, null, v_memo, p, null);
    if v_type = 'loan_received' then
      perform public._line(v, v_money, v_amount, 0);
      perform public._line(v, public._acct(p_org, 'loans'), 0, v_amount, null, v_party);
    else
      perform public._line(v, public._acct(p_org, 'loans'), v_amount, 0, null, v_party);
      perform public._line(v, v_money, 0, v_amount);
    end if;

  -- V13 Opening balances (auto-balanced to Opening Balance Equity)
  -- V14 General journal (must balance on its own)
  -- lines: [{account_id, debit, credit, property_id?, party_id?, holding_id?, weight?, unit?, memo?}]
  -- A weight goes in on a debit line and out on a credit line.
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
      v_lhold := public._uuid(v_line, 'holding_id');
      v_lqty := null;
      if nullif(v_line ->> 'weight', '') is not null then
        v_lqty := public._weight(v_line);
        if public._amount(v_line, 'credit', false) > 0 then v_lqty := -v_lqty; end if;
      end if;
      perform public._line(v, public._uuid(v_line, 'account_id', true),
                           public._amount(v_line, 'debit', false), public._amount(v_line, 'credit', false),
                           public._uuid(v_line, 'property_id'), public._uuid(v_line, 'party_id'),
                           v_line ->> 'memo', v_lhold, v_lqty);
    end loop;
    if v_type = 'opening' and v_dr <> v_cr then
      perform public._line(v, public._acct(p_org, 'opening_equity'),
                           greatest(v_cr - v_dr, 0), greatest(v_dr - v_cr, 0));
    end if;

  -- H1 Bought a vehicle / gold / silver:
  --   Dr <class> at Cost [H, +weight] price · Cr money paid_now · Cr Payable to Sellers [H,Pty] balance
  when 'holding_purchase' then
    v_price := public._amount(p, 'price');
    v_now := public._amount(p, 'paid_now', false);
    if v_price = 0 then raise exception 'price must be greater than zero' using errcode = '22023'; end if;
    if v_now > v_price then raise exception 'paid_now exceeds price' using errcode = '22023'; end if;
    if v_now < v_price and v_party is null then
      raise exception 'a seller is required when part of the price is unpaid' using errcode = '22023';
    end if;
    if v_metal then
      v_qty := public._weight(p);
    -- A vehicle is bought once: by a purchase or an opening balance that still stands. (Not "cost <> 0":
    -- editing the purchase reverses it first while later costs remain.)
    elsif exists (
      select 1 from public.journal_lines jl join public.vouchers pv on pv.id = jl.voucher_id
      where jl.org_id = p_org and jl.holding_id = v_hold and jl.account_id = v_hacct and jl.debit > 0
        and pv.type in ('holding_purchase', 'opening') and pv.status = 'posted' and pv.reverses_id is null
    ) then
      raise exception '% is already recorded as bought', h.code using errcode = '22023';
    end if;
    if v_now > 0 then v_money := public._money_account(p_org, public._uuid(p, 'account_id')); end if;
    v := public._new_voucher(p_org, v_type, v_date, v_price, null, v_party, null, v_memo, p, null, v_hold);
    perform public._line(v, v_hacct, v_price, 0, null, v_party, null, v_hold, v_qty);
    perform public._line(v, v_money, 0, v_now);
    perform public._line(v, public._acct(p_org, 'payable_sellers'), 0, v_price - v_now, null, v_party, null, v_hold, null);

  -- H2 Paid a cost on a vehicle / gold item: Dr <class> at Cost [H] · Cr money (adds cost, not weight)
  when 'holding_cost' then
    v_amount := public._amount(p, 'amount');
    if (v_metal and public._holding_weight(p_org, v_hold) <= 0)
       or (not v_metal and public._holding_cost(p_org, v_hold) <= 0) then
      raise exception 'record the purchase of % first', h.code using errcode = '22023';
    end if;
    v_money := public._money_account(p_org, public._uuid(p, 'account_id'));
    v := public._new_voucher(p_org, v_type, v_date, v_amount, null, v_party, null, v_memo, p, null, v_hold);
    perform public._line(v, v_hacct, v_amount, 0, null, v_party, null, v_hold, null);
    perform public._line(v, v_money, 0, v_amount);

  -- H3 Sold a vehicle / gold / silver:
  --   Dr money received_now · Dr Receivable from Buyers [H,Pty] balance
  --   · Cr <class> at Cost [H, −weight] C · Cr (gain) or Dr (loss) Gain on Sale of Assets [H] S − C.
  --   C = the vehicle's full cost; for metal, cost × sold ÷ held (2 dp), or all of it when all is sold.
  when 'holding_sale' then
    v_price := public._amount(p, 'price');
    v_now := public._amount(p, 'received_now', false);
    if v_price = 0 then raise exception 'price must be greater than zero' using errcode = '22023'; end if;
    if v_now > v_price then raise exception 'received_now exceeds price' using errcode = '22023'; end if;
    if v_now < v_price and v_party is null then
      raise exception 'a buyer is required when part of the price is still to be received' using errcode = '22023';
    end if;
    v_cost := public._holding_cost(p_org, v_hold);
    if v_metal then
      v_held := public._holding_weight(p_org, v_hold);
      if v_held <= 0 then
        raise exception '% has no weight held', h.code using errcode = '22023';
      end if;
      if coalesce((p ->> 'whole')::boolean, false) then
        v_qty := v_held;
      else
        v_qty := public._weight(p);
        if v_qty > v_held then
          raise exception 'weight sold (% g) is more than the weight held (% g)',
            trim_scale(v_qty), trim_scale(v_held) using errcode = '22023';
        end if;
      end if;
      if v_qty < v_held then
        v_cost := round(v_cost * v_qty / v_held, 2);
      end if;
    end if;
    if v_cost <= 0 then
      raise exception 'no cost is recorded for this sale of %; record its purchase first', h.code
        using errcode = '22023';
    end if;
    if v_now > 0 then v_money := public._money_account(p_org, public._uuid(p, 'account_id')); end if;
    v := public._new_voucher(p_org, v_type, v_date, v_price, null, v_party, null, v_memo, p, null, v_hold);
    perform public._line(v, v_money, v_now, 0);
    perform public._line(v, public._acct(p_org, 'receivable_buyers'), v_price - v_now, 0, null, v_party, null, v_hold, null);
    perform public._line(v, v_hacct, 0, v_cost, null, null, 'Cost of item sold', v_hold, -v_qty);
    perform public._line(v, public._acct(p_org, 'asset_gain'),
                         greatest(v_cost - v_price, 0), greatest(v_price - v_cost, 0), null, null, null, v_hold, null);
    v_result := jsonb_build_object('cost', v_cost::numeric(18, 2)::text,
                                   'profit', (v_price - v_cost)::numeric(18, 2)::text);
    if v_metal then
      v_result := v_result || jsonb_build_object('weight_g', trim_scale(v_qty)::text);
    end if;
  end case;

  insert into public.audit_log (org_id, action, voucher_id, details)
  values (p_org, 'post', v.id, jsonb_build_object('number', v.number, 'payload', p));

  return jsonb_build_object('id', v.id, 'number', v.number) || coalesce(v_result, '{}');
end $$;

-- ---------------------------------------------------------------------------
-- Backstop: at commit, no lender may be owed less than zero. It guards every path that writes lines on Loans Payable
-- (a repayment, the void of a loan that was repaid in part, an edit that lowers it, a manual journal). It is
-- deferred so that an edit (reverse, then repost) is judged on its end state, not in between.
-- ---------------------------------------------------------------------------
create function public.check_loan_not_negative() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owed numeric;
begin
  if not exists (select 1 from public.accounts where id = new.account_id and system_key = 'loans') then
    return null;
  end if;
  v_owed := public._loan_owed(new.org_id, new.party_id);
  if v_owed < 0 then
    raise exception '% has been repaid more than the loans on record (short by %). Void or edit the repayments first.',
      (select name from public.parties where id = new.party_id), to_char(-v_owed, 'FM999,999,999,999,990.00')
      using errcode = '23514';
  end if;
  return null;
end $$;

revoke execute on function public.check_loan_not_negative() from public, anon, authenticated;

create constraint trigger journal_lines_loan_not_negative
  after insert on public.journal_lines
  deferrable initially deferred
  for each row when (new.party_id is not null)
  execute function public.check_loan_not_negative();

-- ---------------------------------------------------------------------------
-- Read side (security invoker: RLS applies, a non-member gets nothing).
-- ---------------------------------------------------------------------------
-- One row per lender (zeros when nothing yet), plus, when a manual journal touched Loans Payable with no lender, one
-- row with party_id null named 'Not assigned to a lender', so the rows always add up to the account balance.
create function public.loan_balances(p_org uuid)
returns table (party_id uuid, name text, borrowed numeric, repaid numeric, owed numeric, last_date date)
language sql stable set search_path = public, pg_temp as $$
  with t as (
    select jl.party_id,
           sum(jl.credit) as cr, sum(jl.debit) as dr, max(jl.entry_date) as last_date
    from public.journal_lines jl join public.accounts a on a.id = jl.account_id
    where jl.org_id = p_org and a.system_key = 'loans'
    group by jl.party_id
  )
  select p.id, p.name,
         coalesce(t.cr, 0)::numeric(18, 2), coalesce(t.dr, 0)::numeric(18, 2),
         (coalesce(t.cr, 0) - coalesce(t.dr, 0))::numeric(18, 2), t.last_date
  from public.parties p left join t on t.party_id = p.id
  where p.org_id = p_org and ('lender' = any (p.roles) or t.party_id is not null)
  union all
  select null::uuid, 'Not assigned to a lender',
         t.cr::numeric(18, 2), t.dr::numeric(18, 2), (t.cr - t.dr)::numeric(18, 2), t.last_date
  from t where t.party_id is null and (t.cr <> 0 or t.dr <> 0)
  order by 2;
$$;

-- A lender's statement: every line on Loans Payable for them, oldest first, with the amount owed after each line.
-- A void shows as its own line (the reversal), so the balance is always right.
create function public.loan_ledger(p_org uuid, p_party uuid)
returns table (seq bigint, entry_date date, voucher_id uuid, voucher_number text, voucher_type public.voucher_type,
               memo text, debit numeric, credit numeric, balance numeric)
language sql stable set search_path = public, pg_temp as $$
  select row_number() over w, jl.entry_date, v.id, v.number, v.type, coalesce(jl.memo, v.memo),
         jl.debit, jl.credit,
         (sum(jl.credit - jl.debit) over w)::numeric(18, 2)
  from public.journal_lines jl
  join public.accounts a on a.id = jl.account_id
  join public.vouchers v on v.id = jl.voucher_id
  where jl.org_id = p_org and a.system_key = 'loans'
    and (jl.party_id = p_party or (p_party is null and jl.party_id is null))
  window w as (order by jl.entry_date, jl.id rows between unbounded preceding and current row)
  order by 1;
$$;

revoke execute on function public.loan_balances(uuid), public.loan_ledger(uuid, uuid) from public, anon;
grant execute on function public.loan_balances(uuid), public.loan_ledger(uuid, uuid) to authenticated;
