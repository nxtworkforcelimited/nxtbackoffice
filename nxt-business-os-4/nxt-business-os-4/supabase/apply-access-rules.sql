-- Re-runnable after upgrade-finance-access.sql and setup-nxt-team.sql.
begin;
do $$declare t uuid;begin
 if (select count(*) from public.memberships m join auth.users u on u.id=m.user_id where lower(u.email)='nyasha@nxt-workforce.com' and m.role='owner')<>1 then raise exception 'Expected exactly one workspace owned by Nyasha';end if;
 select m.tenant_id into t from public.memberships m join auth.users u on u.id=m.user_id where lower(u.email)='nyasha@nxt-workforce.com' and m.role='owner';
 -- Reset only staff/admin capability grants in this workspace; preserve owner and clients.
 delete from public.member_permissions p using public.memberships m where p.tenant_id=t and m.tenant_id=p.tenant_id and m.user_id=p.user_id and m.role in ('staff','admin');
 insert into public.member_permissions select t,m.user_id,c from public.memberships m cross join unnest(array['delivery','content','documents','finance','sms','reports','website']) c where m.tenant_id=t and m.role in ('staff','admin');
 insert into public.member_permissions select t,m.user_id,c from public.memberships m join auth.users u on u.id=m.user_id cross join lateral unnest(case lower(u.email)
 when 'bridget@nxt-workforce.com' then array['hr','payroll','approve_leave']
 when 'michael@nxt-workforce.com' then array['crm','task_admin','finance_admin']
 when 'adrian@nxt-workforce.com' then array['tickets'] else array[]::text[] end) c where m.tenant_id=t and m.role in ('staff','admin');
end $$;
select d.name,d.email,array_agg(p.capability order by p.capability) as permissions from public.staff_directory d left join public.member_permissions p using(tenant_id,user_id) where d.tenant_id in(select m.tenant_id from public.memberships m join auth.users u on u.id=m.user_id where lower(u.email)='nyasha@nxt-workforce.com' and m.role='owner') group by d.name,d.email;
commit;
