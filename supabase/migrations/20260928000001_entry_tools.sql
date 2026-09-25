-- M4: tools for the entry screens. The posting rules are unchanged (post_voucher is the single
-- source of truth); these functions only preview and describe vouchers.

-- Runs post_voucher inside a sub-transaction, captures what it would record (number, lines, sale
-- profit), then rolls the sub-transaction back: no voucher, no used number, no audit row remain.
-- plpgsql variables survive the rollback, which is how the result gets out.
-- Security invoker: post_voucher still enforces roles, and RLS applies to the lines we read back.
create function public.preview_voucher(p_org uuid, p jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  v_result jsonb;
  v_lines jsonb;
begin
  begin
    v_result := public.post_voucher(p_org, p);
    select coalesce(jsonb_agg(jsonb_build_object(
             'code', a.code, 'name', a.name,
             'debit', jl.debit::text, 'credit', jl.credit::text,
             'property_code', pr.code, 'party_name', pa.name, 'memo', jl.memo) order by jl.id), '[]')
      into v_lines
    from public.journal_lines jl
    join public.accounts a on a.id = jl.account_id
    left join public.properties pr on pr.id = jl.property_id
    left join public.parties pa on pa.id = jl.party_id
    where jl.voucher_id = (v_result ->> 'id')::uuid;
    raise exception 'preview rollback' using errcode = 'PV001';
  exception when sqlstate 'PV001' then
    null; -- expected: undo everything post_voucher did
  end;
  return (v_result - 'id') || jsonb_build_object('lines', v_lines);
end $$;

-- Everything the entry detail page shows, in one call. Security invoker: RLS decides visibility,
-- so a voucher of another organization returns null.
create function public.voucher_detail(p_voucher uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', v.id, 'org_id', v.org_id, 'number', v.number, 'type', v.type, 'date', v.date,
    'status', v.status, 'amount', v.amount::text, 'memo', v.memo, 'payload', v.payload,
    'created_at', v.created_at, 'created_by', v.created_by,
    'property', case when pr.id is not null
                     then jsonb_build_object('id', pr.id, 'code', pr.code, 'name', pr.name) end,
    'party', case when pa.id is not null then jsonb_build_object('id', pa.id, 'name', pa.name) end,
    'reverses', (select jsonb_build_object('id', r.id, 'number', r.number)
                 from vouchers r where r.id = v.reverses_id),
    'reversed_by', (select jsonb_build_object('id', r.id, 'number', r.number)
                    from vouchers r where r.reverses_id = v.id limit 1),
    'replaced_by', (select jsonb_build_object('id', r.id, 'number', r.number)
                    from vouchers r where r.id = v.replaced_by_id),
    'replaces', (select jsonb_build_object('id', r.id, 'number', r.number)
                 from vouchers r where r.replaced_by_id = v.id limit 1),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'code', a.code, 'name', a.name, 'debit', jl.debit::text, 'credit', jl.credit::text,
                'property_code', lp.code, 'party_name', lq.name, 'memo', jl.memo) order by jl.id), '[]')
              from journal_lines jl
              join accounts a on a.id = jl.account_id
              left join properties lp on lp.id = jl.property_id
              left join parties lq on lq.id = jl.party_id
              where jl.voucher_id = v.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object(
                  'at', al.at, 'action', al.action, 'user_id', al.user_id,
                  'details', al.details - 'payload' - 'before') order by al.at, al.id), '[]')
                from audit_log al where al.voucher_id = v.id)
  )
  from vouchers v
  left join properties pr on pr.id = v.property_id
  left join parties pa on pa.id = v.party_id
  where v.id = p_voucher;
$$;

-- Preview of a correction. A correction is reverse + repost, so previewing it as a fresh post is wrong:
-- a sale would be rejected ("already sold") and would show no cost, and the number would be off by
-- one (the reversal takes the next number first). This runs the real edit_voucher and rolls it back.
create function public.preview_edit(p_voucher uuid, p_changes jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare
  v_result jsonb;
  v_lines jsonb;
begin
  begin
    v_result := public.edit_voucher(p_voucher, p_changes);
    select coalesce(jsonb_agg(jsonb_build_object(
             'code', a.code, 'name', a.name,
             'debit', jl.debit::text, 'credit', jl.credit::text,
             'property_code', pr.code, 'party_name', pa.name, 'memo', jl.memo) order by jl.id), '[]')
      into v_lines
    from public.journal_lines jl
    join public.accounts a on a.id = jl.account_id
    left join public.properties pr on pr.id = jl.property_id
    left join public.parties pa on pa.id = jl.party_id
    where jl.voucher_id = (v_result ->> 'id')::uuid;
    raise exception 'preview rollback' using errcode = 'PV001';
  exception when sqlstate 'PV001' then
    null;
  end;
  return (v_result - 'id') || jsonb_build_object('lines', v_lines);
end $$;

-- Check the caller's role BEFORE any other validation, so an outsider holding another business's
-- voucher id learns nothing (previously "voucher X cannot be edited" revealed its number).
create or replace function public.edit_voucher(p_voucher uuid, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.vouchers;
  n jsonb;
begin
  select * into o from public.vouchers where id = p_voucher;
  if not found then
    raise exception 'voucher not found' using errcode = '22023';
  end if;
  perform public.require_role(o.org_id, '{owner,accountant}');
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
