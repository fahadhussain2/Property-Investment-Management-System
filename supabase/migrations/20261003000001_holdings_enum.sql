-- Spec 003 (holdings: vehicles, gold, silver): new voucher types.
-- On its own file: a value added to an enum cannot be used in the transaction that adds it, and the
-- posting migration that follows uses these values.

alter type public.voucher_type add value 'holding_purchase';
alter type public.voucher_type add value 'holding_cost';
alter type public.voucher_type add value 'holding_sale';
