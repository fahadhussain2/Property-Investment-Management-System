-- M3: chart-of-accounts management.
-- Accounts are created only through RPCs (add_money_account from M1, add_category_account below),
-- so users cannot forge system accounts or pick codes outside their range.
-- A guard trigger keeps history meaningful: account types never change (so no head can be turned into
-- a fake bank or sales account), system accounts can only be renamed, names stay unique, and no
-- account with money in it can be hidden (deactivated).

drop policy accounts_insert on public.accounts;

-- Type and subtype must agree (e.g. no 'asset' account with subtype 'sales'). Reports and posting
-- classify accounts by subtype, so an inconsistent pair would mislead both.
alter table public.accounts add constraint accounts_type_subtype_ck check (
  case type
    when 'asset' then subtype in ('cash', 'bank', 'property', 'receivable', 'other')
    when 'liability' then subtype in ('payable', 'advance', 'deposit', 'loan', 'other')
    when 'equity' then subtype in ('capital', 'drawings', 'opening', 'retained', 'other')
    when 'income' then subtype in ('sales', 'rent', 'income', 'other')
    when 'expense' then subtype in ('cogs', 'property_expense', 'selling_expense', 'general_expense', 'other')
  end
);

-- Code ranges for user-defined heads of account (spec §4).
create function public.add_category_account(p_org uuid, p_kind text, p_name text) returns uuid
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
               ('general_expense', 6600, 6899, 'expense')) as r (k, lo, hi, t)
  where r.k = p_kind;
  if v_lo is null then
    raise exception 'kind must be income, property_expense, selling_expense or general_expense'
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

create function public.guard_account_change() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_balance numeric;
begin
  if tg_op = 'DELETE' then
    -- Allowed while the whole organization is being deleted (cascade runs after the org row is gone).
    if old.system_key is not null and exists (select 1 from public.organizations where id = old.org_id) then
      raise exception 'system accounts cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  if (new.id, new.org_id, new.code, new.system_key) is distinct from (old.id, old.org_id, old.code, old.system_key) then
    raise exception 'account code cannot be changed' using errcode = '23514';
  end if;
  -- Type and subtype are fixed at creation (by the RPCs). Allowing a change, even on an unused
  -- account, would let a user turn an income head into a fake bank or sales account.
  if (new.type, new.subtype) is distinct from (old.type, old.subtype) then
    raise exception 'an account''s type cannot be changed; add a new account instead' using errcode = '23514';
  end if;
  if old.system_key is not null and not new.is_active then
    raise exception 'system accounts can only be renamed' using errcode = '23514';
  end if;
  if lower(trim(new.name)) <> lower(trim(old.name)) and exists (
    select 1 from public.accounts
    where org_id = new.org_id and id <> new.id and lower(trim(name)) = lower(trim(new.name))
  ) then
    raise exception 'an account named "%" already exists', trim(new.name) using errcode = '23505';
  end if;
  if old.is_active and not new.is_active then
    select coalesce(sum(debit - credit), 0) into v_balance
    from public.journal_lines where account_id = old.id;
    if v_balance <> 0 then
      raise exception 'account has a balance of %; bring it to zero before deactivating', v_balance
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger accounts_guard
  before update or delete on public.accounts
  for each row execute function public.guard_account_change();

-- Lock the money account for the rest of the posting transaction, so a concurrent deactivation waits
-- (and then sees the new balance) instead of hiding an account that is receiving money.
create or replace function public._money_account(p_org uuid, p_id uuid) returns uuid
language plpgsql volatile set search_path = public, pg_temp as $$
begin
  perform 1 from public.accounts
  where org_id = p_org and id = p_id and subtype in ('cash', 'bank') and is_active
  for share;
  if p_id is null or not found then
    raise exception 'choose an active cash or bank account' using errcode = '22023';
  end if;
  return p_id;
end $$;
revoke execute on function public._money_account(uuid, uuid) from public, anon, authenticated;
