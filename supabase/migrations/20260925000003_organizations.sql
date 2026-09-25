-- Organization onboarding: create org, make caller the owner, seed the chart of accounts (spec §4).

create function public.seed_chart_of_accounts(p_org uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.accounts (org_id, code, name, type, subtype, system_key)
  select p_org, code, name, type::public.account_type, subtype, system_key
  from (values
    ('1000', 'Cash in Hand',                 'asset',     'cash',             'cash'),
    ('1200', 'Properties at Cost',           'asset',     'property',         'properties'),
    ('1300', 'Receivable from Buyers',       'asset',     'receivable',       'receivable_buyers'),
    ('1310', 'Rent Receivable',              'asset',     'receivable',       'rent_receivable'),
    ('2000', 'Payable to Sellers',           'liability', 'payable',          'payable_sellers'),
    ('2100', 'Advances from Buyers',         'liability', 'advance',          'advances_buyers'),
    ('2200', 'Security Deposits Held',       'liability', 'deposit',          'deposits_held'),
    ('2300', 'Loans Payable',                'liability', 'loan',             'loans'),
    ('3000', 'Owner''s Capital',             'equity',    'capital',          'capital'),
    ('3100', 'Owner''s Drawings',            'equity',    'drawings',         'drawings'),
    ('3200', 'Opening Balance Equity',       'equity',    'opening',          'opening_equity'),
    ('3300', 'Retained Earnings',            'equity',    'retained',         'retained_earnings'),
    ('4000', 'Property Sales',               'income',    'sales',            'sales'),
    ('4100', 'Rent Income',                  'income',    'rent',             'rent_income'),
    ('4200', 'Commission Income',            'income',    'income',           'commission_income'),
    ('4900', 'Other Income',                 'income',    'income',           'other_income'),
    ('5000', 'Cost of Properties Sold',      'expense',   'cogs',             'cogs'),
    ('6000', 'Repairs & Maintenance',        'expense',   'property_expense', null),
    ('6010', 'Utilities',                    'expense',   'property_expense', null),
    ('6020', 'Property Tax',                 'expense',   'property_expense', null),
    ('6030', 'Society & Maintenance Charges','expense',   'property_expense', null),
    ('6100', 'Selling Expenses (Brokerage)', 'expense',   'selling_expense',  'selling_expenses'),
    ('6500', 'Office Expenses',              'expense',   'general_expense',  null),
    ('6510', 'Salaries & Wages',             'expense',   'general_expense',  null),
    ('6520', 'Travel & Transport',           'expense',   'general_expense',  null),
    ('6590', 'Bank Charges',                 'expense',   'general_expense',  null),
    ('6900', 'Miscellaneous Expenses',       'expense',   'general_expense',  null)
  ) as t (code, name, type, subtype, system_key);
$$;
revoke execute on function public.seed_chart_of_accounts(uuid) from public, anon, authenticated;

create function public.create_organization(
  p_name text, p_currency text default 'PKR', p_fiscal_year_start_month int default 7
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  insert into public.organizations (name, currency, fiscal_year_start_month, created_by)
  values (p_name, upper(p_currency), p_fiscal_year_start_month, auth.uid())
  returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  perform public.seed_chart_of_accounts(v_org);
  return v_org;
end $$;

-- Bank accounts get codes 1101..1199; extra cash accounts 1001..1099.
create function public.add_money_account(
  p_org uuid, p_kind text, p_name text, p_bank_name text default null, p_account_no text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base int := case p_kind when 'bank' then 1100 when 'cash' then 1000 end;
  v_code int;
  v_id uuid;
begin
  perform public.require_role(p_org, '{owner,accountant}');
  if v_base is null then
    raise exception 'kind must be bank or cash' using errcode = '22023';
  end if;
  select coalesce(max(code::int), v_base) + 1 into v_code
  from public.accounts
  where org_id = p_org and code::int between v_base and v_base + 99;
  if v_code > v_base + 99 then
    raise exception 'too many % accounts', p_kind using errcode = '22023';
  end if;
  insert into public.accounts (org_id, code, name, type, subtype, bank_name, bank_account_no)
  values (p_org, v_code::text, p_name, 'asset', p_kind, p_bank_name, p_account_no)
  returning id into v_id;
  return v_id;
end $$;
