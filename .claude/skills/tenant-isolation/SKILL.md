---
name: tenant-isolation
description: Multi-tenant (organization) isolation rules. Use when creating tables, migrations, RLS policies, RPC functions, storage buckets, or any query path.
---

# Tenant (organization) isolation

- Every business table: `org_id uuid not null references organizations(id)`, `alter table … enable row level security`, and policies for select, insert, update and delete using the `is_member(org_id)` / `has_role(org_id, roles[])` helpers.
- `viewer` role: select only. `accountant`: post and edit vouchers and master data. `owner`: everything, including members and settings.
- RPCs are `security invoker` by default. If one must be `security definer`, it must call `has_role(...)` first, `set search_path = public, pg_temp`, and never trust an `org_id` without checking membership.
- Foreign keys across tables must stay within the same org. Add composite FKs `(org_id, id)` or check inside the RPC.
- Storage buckets: object path prefix `org_id/…` with policies matching membership.
- The frontend only ever uses the **anon key** plus the user's session. The service-role key never leaves CI.
- Required test for every new table or RPC: user of org A cannot select, insert, update or delete org B rows (pgTAP, `set local role authenticated` + `request.jwt.claims`).
