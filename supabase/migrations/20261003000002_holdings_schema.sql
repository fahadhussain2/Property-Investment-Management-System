-- Spec 003 §3, §4, §5, §6: holdings (vehicles, gold and silver items), metal rates, the holding tag and
-- weight on journal lines, and the new accounts.
-- Skills: .claude/skills/accounting-integrity, .claude/skills/tenant-isolation

-- ---------------------------------------------------------------------------
-- Weight units. Grams are the stored unit; 1 tola = 11.6638038 g. Weights are numeric(24,10), so any
-- g / kg / tola entry with up to 3 decimals is stored exactly (7 + 3 decimals).
-- ---------------------------------------------------------------------------
create function public.unit_to_grams(p_qty numeric, p_unit text) returns numeric
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  return (p_qty * case p_unit
                    when 'g' then 1
                    when 'kg' then 1000
                    when 'tola' then 11.6638038
                  end)::numeric(24, 10);
end $$;

-- ---------------------------------------------------------------------------
-- Holdings: a vehicle, or one gold or silver item. Status is derived (holding_status), not stored.
-- ---------------------------------------------------------------------------
create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  class text not null check (class in ('vehicle', 'gold', 'silver')),
  code text not null check (length(trim(code)) > 0),
  name text,
  make text,
  model text,
  year int check (year between 1900 and 2100),
  registration_no text,
  chassis_no text,
  engine_no text,
  colour text,
  purity numeric(5, 4) check (purity > 0 and purity <= 1),
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  -- Purity is what makes a metal item's market value; a vehicle has none.
  check ((class = 'vehicle') = (purity is null)),
  check (class = 'vehicle'
         or (make, model, year, registration_no, chassis_no, engine_no, colour) is null)
);
create unique index holdings_org_code_idx on public.holdings (org_id, upper(code));
create index holdings_org_class_idx on public.holdings (org_id, class);

-- The class decides which cost account the item's entries use, so it never changes.
create function public.guard_holding_class() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.class is distinct from old.class or new.org_id is distinct from old.org_id then
    raise exception 'a holding''s class cannot be changed; add a new one instead' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger holdings_guard
  before update on public.holdings
  for each row execute function public.guard_holding_class();

-- ---------------------------------------------------------------------------
-- Metal rates: the organization's rate for one tola of pure gold (24K) or pure silver on a date.
-- ---------------------------------------------------------------------------
create table public.metal_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  metal text not null check (metal in ('gold', 'silver')),
  rate_date date not null,
  rate_per_tola numeric(18, 2) not null check (rate_per_tola > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, metal, rate_date)
);

alter table public.holdings enable row level security;
alter table public.metal_rates enable row level security;

do $$
declare t text;
begin
  foreach t in array array['holdings', 'metal_rates'] loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(org_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.has_role(org_id, ''{owner,accountant}''))', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update to authenticated using (public.has_role(org_id, ''{owner,accountant}'')) with check (public.has_role(org_id, ''{owner,accountant}''))', t);
    execute format(
      'create policy %1$s_delete on public.%1$s for delete to authenticated using (public.has_role(org_id, ''{owner,accountant}''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- The holding tag and weight on vouchers and journal lines (same-org FKs).
-- quantity_g is signed: + on a debit (weight in), − on a credit (weight out).
-- ---------------------------------------------------------------------------
alter table public.vouchers
  add column holding_id uuid,
  add foreign key (org_id, holding_id) references public.holdings (org_id, id);
create index vouchers_holding_idx on public.vouchers (org_id, holding_id);

alter table public.journal_lines
  add column holding_id uuid,
  add column quantity_g numeric(24, 10),
  add foreign key (org_id, holding_id) references public.holdings (org_id, id),
  add constraint journal_lines_quantity_side_ck check (
    quantity_g is null or quantity_g = 0
    or (quantity_g > 0 and debit > 0) or (quantity_g < 0 and credit > 0));
create index journal_lines_holding_idx on public.journal_lines (org_id, holding_id);

-- Posted vouchers stay immutable: holding_id joins the frozen columns.
create or replace function public.guard_voucher_update() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'vouchers are immutable; reverse the voucher instead' using errcode = '42501';
  end if;
  if (new.id, new.org_id, new.number, new.type, new.date, new.amount, new.property_id,
      new.party_id, new.lease_id, new.holding_id, new.memo, new.payload, new.reverses_id, new.created_by,
      new.created_at)
     is distinct from
     (old.id, old.org_id, old.number, old.type, old.date, old.amount, old.property_id,
      old.party_id, old.lease_id, old.holding_id, old.memo, old.payload, old.reverses_id, old.created_by,
      old.created_at)
     or (old.status = 'reversed' and new.status = 'posted')
     or (old.replaced_by_id is not null and new.replaced_by_id is distinct from old.replaced_by_id)
  then
    raise exception 'vouchers are immutable; reverse the voucher instead' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Accounts: new subtypes and heads (spec §4).
-- ---------------------------------------------------------------------------
alter table public.accounts drop constraint accounts_subtype_check;
alter table public.accounts add constraint accounts_subtype_check check (subtype in (
  'cash', 'bank', 'property', 'holding', 'receivable', 'payable', 'advance', 'deposit', 'loan',
  'capital', 'drawings', 'opening', 'retained', 'sales', 'rent', 'income', 'asset_gain', 'cogs',
  'property_expense', 'vehicle_expense', 'selling_expense', 'general_expense', 'other'
));
alter table public.accounts drop constraint accounts_type_subtype_ck;
alter table public.accounts add constraint accounts_type_subtype_ck check (
  case type
    when 'asset' then subtype in ('cash', 'bank', 'property', 'holding', 'receivable', 'other')
    when 'liability' then subtype in ('payable', 'advance', 'deposit', 'loan', 'other')
    when 'equity' then subtype in ('capital', 'drawings', 'opening', 'retained', 'other')
    when 'income' then subtype in ('sales', 'rent', 'income', 'asset_gain', 'other')
    when 'expense' then subtype in ('cogs', 'property_expense', 'vehicle_expense', 'selling_expense',
                                    'general_expense', 'other')
  end
);

-- The spec 003 heads. None of these codes is in a user-assignable range (money accounts 1001–1199,
-- income 4300–4899, expenses 6040–6099 / 6110–6199 / 6230–6299 / 6600–6899), so they can never clash
-- with an account a user added. A non-system head is skipped if the organization already has an
-- account with the same name (e.g. its own "Fuel").
create function public._seed_holding_accounts(p_org uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.accounts (org_id, code, name, type, subtype, system_key)
  select p_org, t.code, t.name, t.type::public.account_type, t.subtype, t.system_key
  from (values
    ('1400', 'Vehicles at Cost',              'asset',   'holding',         'vehicles'),
    ('1500', 'Gold at Cost',                  'asset',   'holding',         'gold'),
    ('1510', 'Silver at Cost',                'asset',   'holding',         'silver'),
    ('4250', 'Gain on Sale of Assets',        'income',  'asset_gain',      'asset_gain'),
    ('6200', 'Fuel',                          'expense', 'vehicle_expense', null),
    ('6210', 'Vehicle Repairs & Maintenance', 'expense', 'vehicle_expense', null),
    ('6220', 'Token Tax & Insurance',         'expense', 'vehicle_expense', null)
  ) as t (code, name, type, subtype, system_key)
  where t.system_key is not null
     or not exists (select 1 from public.accounts a
                    where a.org_id = p_org and lower(trim(a.name)) = lower(t.name))
  on conflict do nothing;
$$;
revoke execute on function public._seed_holding_accounts(uuid) from public, anon, authenticated;

create or replace function public.seed_chart_of_accounts(p_org uuid) returns void
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
  select public._seed_holding_accounts(p_org);
$$;
revoke execute on function public.seed_chart_of_accounts(uuid) from public, anon, authenticated;

-- Existing organizations get the new heads too.
select public._seed_holding_accounts(id) from public.organizations;

-- Users can add their own vehicle expense heads (6230–6299).
create or replace function public.add_category_account(p_org uuid, p_kind text, p_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lo int;
  v_hi int;
  v_type public.account_type;
  v_name text := trim(coalesce(p_name, ''));
  v_code int;
  v_id uuid;
begin
  perform public.require_role(p_org, '{owner,accountant}');
  select r.lo, r.hi, r.t::public.account_type into v_lo, v_hi, v_type
  from (values ('income', 4300, 4899, 'income'),
               ('property_expense', 6040, 6099, 'expense'),
               ('selling_expense', 6110, 6199, 'expense'),
               ('vehicle_expense', 6230, 6299, 'expense'),
               ('general_expense', 6600, 6899, 'expense')) as r (k, lo, hi, t)
  where r.k = p_kind;
  if v_lo is null then
    raise exception 'kind must be income, property_expense, vehicle_expense, selling_expense or general_expense'
      using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'account name is required' using errcode = '22023';
  end if;
  if exists (select 1 from public.accounts where org_id = p_org and lower(name) = lower(v_name)) then
    raise exception 'an account named "%" already exists', v_name using errcode = '23505';
  end if;

  select coalesce(max(code::int), v_lo - 1) + 1 into v_code
  from public.accounts where org_id = p_org and code::int between v_lo and v_hi;
  if v_code > v_hi then
    raise exception 'no more codes available for %', p_kind using errcode = '22023';
  end if;

  insert into public.accounts (org_id, code, name, type, subtype)
  values (p_org, v_code::text, v_name, v_type, p_kind)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Journal line rules for holdings (spec §5):
--  * lines on Vehicles/Gold/Silver at Cost carry a holding of that class;
--  * only Gold/Silver at Cost lines carry a weight (0 for cost-only lines);
--  * an item's weight held never goes below zero (checked at commit, after the whole voucher).
-- ---------------------------------------------------------------------------
create function public.check_journal_line_holding() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_key text;
  v_want text;
  v_class text;
begin
  select system_key into v_key from public.accounts where id = new.account_id;
  if v_key in ('vehicles', 'gold', 'silver') then
    v_want := replace(v_key, 'vehicles', 'vehicle');
    if new.holding_id is null then
      raise exception 'entries on % need a % item', v_key, v_want using errcode = '22023';
    end if;
    select class into v_class from public.holdings where org_id = new.org_id and id = new.holding_id;
    if v_class is distinct from v_want then
      raise exception 'a % item cannot be posted to %', v_class, v_key using errcode = '22023';
    end if;
    if v_key = 'vehicles' then
      if new.quantity_g is not null then
        raise exception 'vehicles have no weight' using errcode = '22023';
      end if;
    else
      new.quantity_g := coalesce(new.quantity_g, 0);
    end if;
  elsif new.quantity_g is not null then
    raise exception 'only gold and silver entries carry a weight' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger journal_lines_holding
  before insert on public.journal_lines
  for each row execute function public.check_journal_line_holding();

create function public.check_holding_weight() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_held numeric;
begin
  select coalesce(sum(quantity_g), 0) into v_held
  from public.journal_lines where org_id = new.org_id and holding_id = new.holding_id;
  if v_held < 0 then
    raise exception 'weight held for % cannot go below zero (would be % g)',
      (select code from public.holdings where id = new.holding_id), v_held using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger journal_lines_weight
  after insert on public.journal_lines
  deferrable initially deferred
  for each row when (new.quantity_g < 0)
  execute function public.check_holding_weight();
