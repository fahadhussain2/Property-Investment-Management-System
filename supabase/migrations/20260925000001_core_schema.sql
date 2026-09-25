-- Core schema: organizations (SaaS tenants), master data, vouchers and the double-entry journal.
-- Spec: intent/001-core-ledger/spec.md §2, §4, §7

create type public.member_role as enum ('owner', 'accountant', 'viewer');
create type public.account_type as enum ('asset', 'liability', 'equity', 'income', 'expense');
create type public.property_kind as enum ('house', 'apartment', 'shop', 'plot', 'office', 'other');
create type public.property_status as enum ('vacant', 'rented', 'under_agreement', 'sold');
create type public.voucher_type as enum (
  'purchase', 'property_cost', 'pay_seller', 'buyer_advance', 'sale', 'receive_buyer',
  'rent', 'deposit', 'expense', 'income', 'transfer', 'capital', 'drawing', 'opening', 'journal'
);
create type public.voucher_status as enum ('posted', 'reversed');

-- ---------------------------------------------------------------------------
-- Organizations & membership
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  fiscal_year_start_month int not null default 7 check (fiscal_year_start_month between 1 and 12),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Chart of accounts. `system_key` is the stable handle posting logic uses; codes are user-facing.
-- Cash and bank accounts are subtype 'cash' / 'bank' ("money accounts").
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^\d{4}$'),
  name text not null check (length(trim(name)) > 0),
  type public.account_type not null,
  subtype text not null default 'other' check (subtype in (
    'cash', 'bank', 'property', 'receivable', 'payable', 'advance', 'deposit', 'loan',
    'capital', 'drawings', 'opening', 'retained', 'sales', 'rent', 'income', 'cogs',
    'property_expense', 'selling_expense', 'general_expense', 'other'
  )),
  system_key text,
  bank_name text,
  bank_account_no text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code),
  unique (org_id, system_key),
  unique (org_id, id)
);

-- ---------------------------------------------------------------------------
-- Parties (sellers, buyers, tenants/renters, agents, partners)
-- ---------------------------------------------------------------------------
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  cnic text,
  address text,
  roles text[] not null default '{}'
    check (roles <@ array['seller', 'buyer', 'tenant', 'agent', 'partner', 'other']::text[]),
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create index parties_org_name_idx on public.parties (org_id, lower(name));

-- ---------------------------------------------------------------------------
-- Properties. Status is NOT stored: it is derived from the ledger and leases (see property_status()).
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  name text,
  kind public.property_kind not null default 'other',
  address text,
  city text,
  area numeric(12, 2),
  area_unit text,
  for_sale boolean not null default false,
  asking_price numeric(18, 2) check (asking_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, id)
);
create unique index properties_org_code_idx on public.properties (org_id, upper(code));

-- ---------------------------------------------------------------------------
-- Leases (property rented to a party with role 'tenant')
-- ---------------------------------------------------------------------------
create table public.leases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null,
  party_id uuid not null,
  start_date date not null,
  end_date date,
  ended_on date,
  monthly_rent numeric(18, 2) not null check (monthly_rent > 0),
  security_deposit numeric(18, 2) not null default 0 check (security_deposit >= 0),
  rent_due_day int not null default 1 check (rent_due_day between 1 and 28),
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, property_id) references public.properties (org_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  check (end_date is null or end_date >= start_date),
  check (ended_on is null or ended_on >= start_date)
);
create index leases_property_idx on public.leases (org_id, property_id);

-- ---------------------------------------------------------------------------
-- Vouchers (business events) and journal lines (double entry). Written ONLY by post_voucher().
-- ---------------------------------------------------------------------------
create table public.voucher_sequences (
  org_id uuid not null references public.organizations (id) on delete cascade,
  prefix text not null,
  last int not null,
  primary key (org_id, prefix)
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  type public.voucher_type not null,
  date date not null,
  status public.voucher_status not null default 'posted',
  amount numeric(18, 2) not null check (amount >= 0),
  property_id uuid,
  party_id uuid,
  lease_id uuid,
  memo text,
  payload jsonb,                 -- original input; used by edit_voucher()
  reverses_id uuid,              -- set on a reversal voucher
  replaced_by_id uuid,           -- set on an edited voucher, points at the corrected one
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, number),
  foreign key (org_id, property_id) references public.properties (org_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id),
  foreign key (org_id, lease_id) references public.leases (org_id, id),
  foreign key (org_id, reverses_id) references public.vouchers (org_id, id),
  foreign key (org_id, replaced_by_id) references public.vouchers (org_id, id)
);
create index vouchers_org_date_idx on public.vouchers (org_id, date desc);
create index vouchers_property_idx on public.vouchers (org_id, property_id);

create table public.journal_lines (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  voucher_id uuid not null,
  entry_date date not null,      -- copy of vouchers.date for fast period reports
  account_id uuid not null,
  debit numeric(18, 2) not null default 0,
  credit numeric(18, 2) not null default 0,
  property_id uuid,
  party_id uuid,
  memo text,
  check (debit >= 0 and credit >= 0 and (debit = 0) <> (credit = 0)),
  foreign key (org_id, voucher_id) references public.vouchers (org_id, id),
  foreign key (org_id, account_id) references public.accounts (org_id, id),
  foreign key (org_id, property_id) references public.properties (org_id, id),
  foreign key (org_id, party_id) references public.parties (org_id, id)
);
create index journal_lines_voucher_idx on public.journal_lines (voucher_id);
create index journal_lines_account_idx on public.journal_lines (org_id, account_id, entry_date);
create index journal_lines_property_idx on public.journal_lines (org_id, property_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  action text not null,
  voucher_id uuid,
  details jsonb
);
create index audit_log_org_idx on public.audit_log (org_id, at desc);

-- ---------------------------------------------------------------------------
-- Integrity: every voucher balances (checked at commit), posted rows are immutable.
-- ---------------------------------------------------------------------------
create function public.check_voucher_balanced() returns trigger
language plpgsql as $$
declare
  d numeric;
  c numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d, c
  from public.journal_lines where voucher_id = new.voucher_id;
  if d <> c then
    raise exception 'Voucher % is unbalanced: debit % <> credit %', new.voucher_id, d, c
      using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger journal_lines_balanced
  after insert on public.journal_lines
  deferrable initially deferred
  for each row execute function public.check_voucher_balanced();

create function public.prevent_change() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are immutable; reverse the voucher instead', tg_table_name
    using errcode = '42501';
end $$;

create trigger journal_lines_immutable
  before update or delete on public.journal_lines
  for each row execute function public.prevent_change();

-- Vouchers: only posted -> reversed and setting replaced_by_id once are allowed.
create function public.guard_voucher_update() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'vouchers are immutable; reverse the voucher instead' using errcode = '42501';
  end if;
  if (new.id, new.org_id, new.number, new.type, new.date, new.amount, new.property_id,
      new.party_id, new.lease_id, new.memo, new.payload, new.reverses_id, new.created_by,
      new.created_at)
     is distinct from
     (old.id, old.org_id, old.number, old.type, old.date, old.amount, old.property_id,
      old.party_id, old.lease_id, old.memo, old.payload, old.reverses_id, old.created_by,
      old.created_at)
     or (old.status = 'reversed' and new.status = 'posted')
     or (old.replaced_by_id is not null and new.replaced_by_id is distinct from old.replaced_by_id)
  then
    raise exception 'vouchers are immutable; reverse the voucher instead' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger vouchers_immutable
  before update or delete on public.vouchers
  for each row execute function public.guard_voucher_update();
