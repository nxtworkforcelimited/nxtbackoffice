begin;
do $$
declare t uuid; manager_id uuid; creator_id uuid;
begin
 select id into t from public.tenants where slug='nxt-workforce';
 select id into manager_id from auth.users where lower(email)='nyasha@nxt-workforce.com';
 select id into creator_id from auth.users where lower(email)='hello@nxt-workforce.com';
 if t is null or manager_id is null or creator_id is null then
 raise exception 'Create both Nyasha and hello in Authentication > Users first. No roles changed.';end if;
 if exists(select 1 from public.memberships where tenant_id=t and user_id in (manager_id,creator_id) and role='client') then raise exception 'One of these accounts is a client. Review membership first.';end if;
 insert into public.memberships(tenant_id,user_id,role) values(t,manager_id,'owner')
 on conflict(tenant_id,user_id) do update set role='owner',client_id=null;
 insert into public.memberships(tenant_id,user_id,role) values(t,creator_id,'staff')
 on conflict(tenant_id,user_id) do update set role='staff',client_id=null;
 delete from public.member_permissions where tenant_id=t and user_id=creator_id and capability='approve_content';
 insert into public.member_permissions(tenant_id,user_id,capability)
 select t,creator_id,c from unnest(array['content','documents','delivery','crm']) c on conflict do nothing;
end;$$;
commit;
select u.email,m.role from public.memberships m join auth.users u on u.id=m.user_id join public.tenants t on t.id=m.tenant_id where t.slug='nxt-workforce' and lower(u.email) in ('nyasha@nxt-workforce.com','hello@nxt-workforce.com');
