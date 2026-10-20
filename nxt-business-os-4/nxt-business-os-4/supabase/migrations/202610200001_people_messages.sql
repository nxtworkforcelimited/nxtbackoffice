begin;
create table public.employees(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),user_id uuid references auth.users(id),
 name text not null check(length(name) between 1 and 160),email text not null default '',phone text not null default '',job_title text not null default '',birth_date date,start_date date,
 bank_name text not null default '',account_name text not null default '',account_number text not null default '',branch text not null default '',status text not null default 'active' check(status in ('active','inactive')),
 created_at timestamptz not null default now(),unique(tenant_id,id),unique(tenant_id,user_id),foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id));
create table public.employee_salaries(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,employee_id uuid not null,currency text not null check(currency in ('USD','ZWG','GBP','AUD')),monthly_gross numeric(14,2) not null check(monthly_gross>=0),effective_date date not null,
 created_at timestamptz not null default now(),foreign key(tenant_id,employee_id) references public.employees(tenant_id,id),unique(employee_id,effective_date));
create table public.employee_files(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,employee_id uuid not null,name text not null check(length(name) between 1 and 200),category text not null check(category in ('CV','ID','Contract','Other')),object_path text not null unique,created_at timestamptz not null default now(),foreign key(tenant_id,employee_id) references public.employees(tenant_id,id));
create table public.leave_requests(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),user_id uuid not null default auth.uid(),requester_email text not null default '',kind text not null check(kind in ('Annual','Sick','Family','Unpaid','Other')),starts date not null,ends date not null,reason text not null check(length(reason) between 1 and 3000),status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),review_note text not null default '',reviewed_by uuid references auth.users(id),created_at timestamptz not null default now(),check(ends>=starts),foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id));
create table public.portal_messages(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,client_id uuid not null,author_id uuid not null default auth.uid(),body text not null check(length(body) between 1 and 5000),created_at timestamptz not null default now(),foreign key(tenant_id,client_id) references public.clients(tenant_id,id),foreign key(tenant_id,author_id) references public.memberships(tenant_id,user_id));
alter table public.employees enable row level security;
alter table public.employee_salaries enable row level security;
alter table public.employee_files enable row level security;
alter table public.leave_requests enable row level security;
alter table public.portal_messages enable row level security;
create policy employees_manage on public.employees for all to authenticated using(public.has_capability(tenant_id,'payroll')) with check(public.has_capability(tenant_id,'payroll') and (user_id is null or exists(select 1 from public.memberships m where m.tenant_id=employees.tenant_id and m.user_id=employees.user_id and m.role<>'client')));
create policy salaries_manage on public.employee_salaries for all to authenticated using(public.has_capability(tenant_id,'payroll')) with check(public.has_capability(tenant_id,'payroll'));
create policy employee_files_manage on public.employee_files for all to authenticated using(public.has_capability(tenant_id,'payroll')) with check(public.has_capability(tenant_id,'payroll') and object_path=tenant_id::text||'/'||id::text);
create policy leave_read on public.leave_requests for select to authenticated using(public.is_staff(tenant_id) and (user_id=auth.uid() or public.has_capability(tenant_id,'payroll')));
create policy leave_create on public.leave_requests for insert to authenticated with check(public.is_staff(tenant_id) and user_id=auth.uid() and status='pending' and reviewed_by is null and review_note='');
create policy message_read on public.portal_messages for select to authenticated using(public.has_capability(tenant_id,'delivery') or public.can_read_client(tenant_id,client_id));
create policy message_send on public.portal_messages for insert to authenticated with check(author_id=auth.uid() and (public.has_capability(tenant_id,'delivery') or public.can_read_client(tenant_id,client_id)));
grant select,insert,update on public.employees to authenticated;
grant select,insert on public.employee_salaries,public.employee_files,public.leave_requests,public.portal_messages to authenticated;
create function public.review_leave(t uuid,r uuid,decision text,note text default '') returns public.leave_requests language plpgsql security definer set search_path='' as $$
declare item public.leave_requests;
begin
 select * into item from public.leave_requests where id=r and tenant_id=t for update;
 if not found or item.status<>'pending' then raise exception 'This request is no longer pending';end if;
 if decision='cancelled' then
  if not public.is_staff(t) or item.user_id<>auth.uid() then raise exception 'Permission denied';end if;
 elsif decision in ('approved','rejected') then
  if not public.has_capability(t,'payroll') or item.user_id=auth.uid() then raise exception 'Another payroll manager must review this request';end if;
 else raise exception 'Invalid decision';end if;
 if length(note)>3000 then raise exception 'Note too long';end if;
 update public.leave_requests set status=decision,review_note=note,reviewed_by=auth.uid() where id=r returning * into item;
 return item;
end;$$;
revoke all on function public.review_leave(uuid,uuid,text,text) from public,anon;
grant execute on function public.review_leave(uuid,uuid,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('employee-files','employee-files',false,10485760,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy employee_object_read on storage.objects for select to authenticated using(bucket_id='employee-files' and exists(select 1 from public.employee_files f where f.object_path=storage.objects.name and public.has_capability(f.tenant_id,'payroll')));
create policy employee_object_create on storage.objects for insert to authenticated with check(bucket_id='employee-files' and exists(select 1 from public.employee_files f where f.object_path=storage.objects.name and public.has_capability(f.tenant_id,'payroll')));
-- Remove client finance access while preserving internal finance and client requests.
alter policy business_read on public.business_items using(
 public.has_capability(tenant_id,case when kind in ('quote','invoice') then 'finance' when kind='payroll' then 'payroll' when kind='sms' then 'sms' else 'delivery' end)
 or (kind='request' and public.can_read_client(tenant_id,client_id)));
commit;
