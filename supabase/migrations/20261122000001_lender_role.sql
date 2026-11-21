-- Spec 008 §3: a lender is a party with the new role 'lender'. Same list as 20260925000001_core_schema.sql plus 'lender'.
alter table public.parties drop constraint parties_roles_check;
alter table public.parties add constraint parties_roles_check
  check (roles <@ array['seller', 'buyer', 'tenant', 'agent', 'partner', 'lender', 'other']::text[]);
