-- Run after upgrade-team-operations.sql, once the four Auth accounts exist.
-- Re-runnable: aligns ONLY these four users with the agreed permissions.
begin;
do $$
declare t uuid; owner_id uuid; member_id uuid; r record;missing text;
begin
 select id into owner_id from auth.users where lower(email)='nyasha@nxt-workforce.com';
 if owner_id is null then raise exception 'Nyasha Auth account is missing';end if;
 select tenant_id into t from public.memberships where user_id=owner_id and role='owner';
 if (select count(*) from public.memberships where user_id=owner_id and role='owner')<>1 then raise exception 'Expected exactly one workspace owned by Nyasha. Select the intended workspace before running this setup.';end if;
 select string_agg(w.email,', ') into missing from (values('bridget@nxt-workforce.com'),('michael@nxt-workforce.com'),('tatenda@nxt-workforce.com'),('adrian@nxt-workforce.com')) w(email) where not exists(select 1 from auth.users u where lower(u.email)=w.email);
 if missing is not null then raise exception 'Create these Auth accounts first: %',missing;end if;
 insert into public.staff_directory values(t,owner_id,'Nyasha Kamupira','nyasha@nxt-workforce.com','Owner','Management','') on conflict(tenant_id,user_id) do update set name=excluded.name,email=excluded.email,job_title=excluded.job_title,department=excluded.department;
 for r in select * from (values
 ('Bridget Kambanje','bridget@nxt-workforce.com','Admin & HR','Administration & HR','Nyasha Kamupira',array['hr','payroll','approve_leave','documents']::text[]),
 ('Michael Muchinenyika','michael@nxt-workforce.com','Project Manager','Projects','Nyasha Kamupira',array['crm','delivery','content','documents','reports']::text[]),
 ('Tatenda Makarakate','tatenda@nxt-workforce.com','Marketing Executive','Marketing','Nyasha Kamupira; Michael Muchinenyika',array['content','documents']::text[]),
 ('Adrian Chaperuka','adrian@nxt-workforce.com','IT Specialist','IT','Nyasha Kamupira',array['tickets']::text[])
 ) as x(name,email,job,department,reports,caps) loop
 select id into member_id from auth.users where lower(email)=r.email;
 if exists(select 1 from public.memberships where tenant_id=t and user_id=member_id and role in ('owner','client')) then raise exception 'Account % already has an owner/client membership. Review it manually; setup will not overwrite that role.',r.email;end if;
 insert into public.memberships(tenant_id,user_id,role) values(t,member_id,'staff') on conflict(tenant_id,user_id) do update set role='staff';
 delete from public.member_permissions where tenant_id=t and user_id=member_id;
 insert into public.member_permissions select t,member_id,unnest(r.caps);
 insert into public.staff_directory values(t,member_id,r.name,r.email,r.job,r.department,r.reports) on conflict(tenant_id,user_id) do update set name=excluded.name,email=excluded.email,job_title=excluded.job_title,department=excluded.department,reports_to=excluded.reports_to;
 -- Link an existing unlinked employee with the same email, rather than creating a duplicate.
 if (select count(*) from public.employees where tenant_id=t and lower(email)=r.email and user_id is null)>1 then raise exception 'Duplicate employee emails for %. Review before setup.',r.email;end if;
 if not exists(select 1 from public.employees where tenant_id=t and user_id=member_id) then
 update public.employees set user_id=member_id where tenant_id=t and lower(email)=r.email and user_id is null;
 end if;
 insert into public.employees(tenant_id,user_id,name,email,job_title,department,reports_to) values(t,member_id,r.name,r.email,r.job,r.department,r.reports) on conflict(tenant_id,user_id) do update set name=excluded.name,email=excluded.email,job_title=excluded.job_title,department=excluded.department,reports_to=excluded.reports_to;
 end loop;
end $$;
select d.name,d.email,d.job_title,d.reports_to,m.role,array_agg(p.capability order by p.capability) as permissions from public.staff_directory d join public.memberships m using(tenant_id,user_id) left join public.member_permissions p using(tenant_id,user_id) where d.tenant_id in(select tenant_id from public.memberships m join auth.users u on u.id=m.user_id where lower(u.email)='nyasha@nxt-workforce.com' and m.role='owner') group by d.name,d.email,d.job_title,d.reports_to,m.role;
commit;
