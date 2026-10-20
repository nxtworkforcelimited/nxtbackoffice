-- 1. Create an Auth user in Supabase Authentication > Users (do not send an invite unless intended).
-- 2. Replace the email below with the exact existing Auth user's email, then run this transaction.
begin;
do $$
declare uid uuid; tid uuid;
begin
 select id into uid from auth.users where email='REPLACE_WITH_OWNER_EMAIL';
 if uid is null then raise exception 'Create the owner Auth user first, and replace the email in this script';end if;
 insert into public.tenants(name,slug) values('NXT Workforce Limited','nxt-workforce') returning id into tid;
 insert into public.memberships(tenant_id,user_id,role) values(tid,uid,'owner');
 insert into public.subscriptions(tenant_id) values(tid);
end;$$;
commit;
