-- Posting engine: the ONLY way money enters the books. Implements spec §5 (V1–V14).
-- Skill: .claude/skills/accounting-integrity

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- ---------------------------------------------------------------------------
create function public._acct(p_org uuid, p_key text) returns uuid
language plpgsql stable set search_path = public, pg_temp as $$
declare v uuid;
begin
  select id into v from public.accounts where org_id = p_org and system_key = p_key;
  if v is null then
    raise exception 'system account % missing', p_key;
  end if;
  return v;
end $$;

-- Reads a non-negative 2dp amount from the payload. Missing + not required -> 0.
create function public._amount(p jsonb, k text, p_required boolean default true) returns numeric
language plpgsql immutable as $$
declare v numeric;
begin
  if nullif(p ->> k, '') is null then
    if p_required then
      raise exception 'missing field: %', k using errcode = '22023';
    end if;
    return 0;
  end if;
  v := (p ->> k)::numeric;
  if v < 0 then
    raise exception '% cannot be negative', k using errcode = '22023';
  end if;
  if v <> round(v, 2) then
    raise exception '% has more than 2 decimal places', k using errcode = '22023';
  end if;
  return v;
end $$;

create function public._uuid(p jsonb, k text, p_required boolean default false) returns uuid
language plpgsql immutable as $$
begin
  if nullif(p ->> k, '') is null then
    if p_required then
      raise exception 'missing field: %', k using errcode = '22023';
    end if;
    return null;
  end if;
  return (p ->> k)::uuid;
end $$;

create function public._money_account(p_org uuid, p_id uuid) returns uuid
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_id is null or not exists (
    select 1 from public.accounts
    where org_id = p_org and id = p_id and subtype in ('cash', 'bank') and is_active
  ) then
    raise exception 'choose an active cash or bank account' using errcode = '22023';
  end if;
  return p_id;
end $$;

create function public._is_sold(p_org uuid, p_prop uuid) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.vouchers
    where org_id = p_org and property_id = p_prop and type = 'sale'
      and status = 'posted' and reverses_id is null
  );
$$;

create function public._voucher_prefix(t public.voucher_type) returns text
language sql immutable as $$
  select case t
    when 'purchase' then 'PUR' when 'property_cost' then 'PCT' when 'pay_seller' then 'PAY'
    when 'buyer_advance' then 'ADV' when 'sale' then 'SAL' when 'receive_buyer' then 'RCV'
    when 'rent' then 'RNT' when 'deposit' then 'DEP' when 'expense' then 'EXP'
    when 'income' then 'INC' when 'transfer' then 'TRF' when 'capital' then 'CAP'
    when 'drawing' then 'DRW' when 'opening' then 'OPN' when 'journal' then 'JV'
  end;
$$;

create function public._new_voucher(
  p_org uuid, p_type public.voucher_type, p_date date, p_amount numeric,
  p_property uuid, p_party uuid, p_lease uuid, p_memo text, p_payload jsonb, p_reverses uuid
) returns public.vouchers
language plpgsql set search_path = public, pg_temp as $$
declare
  v_prefix text := public._voucher_prefix(p_type);
  v_n int;
  v public.vouchers;
begin
  insert into public.voucher_sequences as s (org_id, prefix, last) values (p_org, v_prefix, 1)
  on conflict (org_id, prefix) do update set last = s.last + 1
  returning last into v_n;

  insert into public.vouchers (org_id, number, type, date, amount, property_id, party_id,
                               lease_id, memo, payload, reverses_id)
  values (p_org, v_prefix || '-' || lpad(v_n::text, 4, '0'), p_type, p_date, p_amount,
          p_property, p_party, p_lease, nullif(trim(p_memo), ''), p_payload, p_reverses)
  returning * into v;
  return v;
end $$;

-- Adds one journal line; silently skips zero amounts so callers can pass optional legs.
create function public._line(
  v public.vouchers, p_account uuid, p_debit numeric, p_credit numeric,
  p_property uuid default null, p_party uuid default null, p_memo text default null
) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(p_debit, 0) = 0 and coalesce(p_credit, 0) = 0 then
    return;
  end if;
  insert into public.journal_lines (org_id, voucher_id, entry_date, account_id, debit, credit,
                                    property_id, party_id, memo)
  values (v.org_id, v.id, v.date, p_account, coalesce(p_debit, 0), coalesce(p_credit, 0),
          p_property, p_party, p_memo);
end $$;

revoke execute on function public._acct, public._amount, public._uuid, public._money_account,
  public._is_sold, public._voucher_prefix, public._new_voucher, public._line
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- post_voucher(org, payload) -> { id, number, profit? }
--
-- Common payload fields: type, date (default today), memo, property_id, party_id, lease_id,
-- account_id (the cash/bank account money moves through), amount.
-- Type-specific: see spec §5 and the branches below.
-- ---------------------------------------------------------------------------
create function public.post_voucher(p_org uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type public.voucher_type;
  v_date date := coalesce(nullif(p ->> 'date', '')::date, current_date);
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

-- ---------------------------------------------------------------------------
-- reverse_voucher: posts the mirror image, marks the original 'reversed'.
-- ---------------------------------------------------------------------------
create function public.reverse_voucher(p_voucher uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.vouchers;
  r public.vouchers;
begin
  select * into o from public.vouchers where id = p_voucher for update;
  if not found then
    raise exception 'voucher not found' using errcode = '22023';
  end if;
  perform public.require_role(o.org_id, '{owner,accountant}');
  if o.status <> 'posted' then
    raise exception 'voucher % is already reversed', o.number using errcode = '22023';
  end if;
  if o.reverses_id is not null then
    raise exception 'a reversal cannot be reversed; post a new voucher instead' using errcode = '22023';
  end if;
  if o.type in ('purchase', 'property_cost') and o.property_id is not null
     and public._is_sold(o.org_id, o.property_id) then
    raise exception 'reverse the sale of this property first' using errcode = '22023';
  end if;

  r := public._new_voucher(o.org_id, o.type, o.date, o.amount, o.property_id, o.party_id, o.lease_id,
                           'Reversal of ' || o.number || coalesce(': ' || nullif(trim(p_reason), ''), ''),
                           null, o.id);
  insert into public.journal_lines (org_id, voucher_id, entry_date, account_id, debit, credit,
                                    property_id, party_id, memo)
  select org_id, r.id, entry_date, account_id, credit, debit, property_id, party_id, memo
  from public.journal_lines where voucher_id = o.id order by id;

  update public.vouchers set status = 'reversed' where id = o.id;
  insert into public.audit_log (org_id, action, voucher_id, details)
  values (o.org_id, 'reverse', o.id, jsonb_build_object('number', o.number, 'reversal', r.number,
                                                        'reason', p_reason));
  return jsonb_build_object('id', r.id, 'number', r.number);
end $$;

-- ---------------------------------------------------------------------------
-- edit_voucher: reverse + repost with changes merged into the original payload.
-- ---------------------------------------------------------------------------
create function public.edit_voucher(p_voucher uuid, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.vouchers;
  n jsonb;
begin
  select * into o from public.vouchers where id = p_voucher;
  if not found then
    raise exception 'voucher not found' using errcode = '22023';
  end if;
  if o.payload is null then
    raise exception 'voucher % cannot be edited', o.number using errcode = '22023';
  end if;
  perform public.reverse_voucher(o.id, 'Edited');
  n := public.post_voucher(o.org_id, o.payload || (p_changes - 'type'));
  update public.vouchers set replaced_by_id = (n ->> 'id')::uuid where id = o.id;
  insert into public.audit_log (org_id, action, voucher_id, details)
  values (o.org_id, 'edit', o.id, jsonb_build_object('number', o.number, 'replaced_by', n ->> 'number',
                                                     'before', o.payload, 'changes', p_changes));
  return n;
end $$;
