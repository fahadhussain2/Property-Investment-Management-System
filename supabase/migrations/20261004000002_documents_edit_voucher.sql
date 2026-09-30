-- Spec 004 §5: an edited entry keeps its documents. edit_voucher (reverse + repost) moves the original's
-- documents to the replacement. A void (reversal only) leaves them on the original.
-- Base: edit_voucher in 20260928000001_entry_tools.sql; only the documents update is new.
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
  update public.documents set voucher_id = (n ->> 'id')::uuid where org_id = o.org_id and voucher_id = o.id;
  insert into public.audit_log (org_id, action, voucher_id, details)
  values (o.org_id, 'edit', o.id, jsonb_build_object('number', o.number, 'replaced_by', n ->> 'number',
                                                     'before', o.payload, 'changes', p_changes));
  return n;
end $$;
