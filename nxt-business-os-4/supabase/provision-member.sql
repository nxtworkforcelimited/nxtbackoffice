-- Run as database administrator. Create the Auth user first.
-- Replace all values. Use role staff/admin for employees; client for clients.
-- CLIENT_ID must belong to TENANT_ID. For staff/admin set client_id to NULL.
insert into public.memberships(tenant_id,user_id,role,client_id)
values ('TENANT_UUID','AUTH_USER_UUID','staff',NULL);
-- Client example:
-- insert into public.memberships(tenant_id,user_id,role,client_id)
-- values ('TENANT_UUID','AUTH_USER_UUID','client','CLIENT_UUID');
-- Remove access immediately by deleting that membership (not by changing user metadata).
