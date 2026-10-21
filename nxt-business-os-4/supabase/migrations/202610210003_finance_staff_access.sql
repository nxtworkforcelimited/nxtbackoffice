-- Owner-authorised finance/payroll onboarding; processed by the existing authenticated email worker.
begin;
create table public.staff_access_requests(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 email text not null check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 name text not null check(length(trim(name)) between 1 and 160),preset text not null default 'finance_payroll' check(preset='finance_payroll'),
 requested_by uuid not null,request_source text not null default 'owner' check(request_source in ('owner','owner_assistant_request')),
 status text not null default 'queued' check(status in ('queued','processing','sent','failed')),
 created_at timestamptz not null default now(),processed_at timestamptz,sent_at timestamptz,account_id uuid references auth.users(id),last_error text,
 foreign key(tenant_id,requested_by) references public.memberships(tenant_id,user_id)
);
alter table public.staff_access_requests enable row level security;
create policy staff_access_owner_read on public.staff_access_requests for select to authenticated using(public.workspace_role_for(tenant_id)='owner');
create policy staff_access_owner_request on public.staff_access_requests for insert to authenticated with check(public.workspace_role_for(tenant_id)='owner' and requested_by=auth.uid() and status='queued' and account_id is null and sent_at is null and processed_at is null and last_error is null);
revoke all on public.staff_access_requests from public,anon,authenticated;
grant select,insert on public.staff_access_requests to authenticated;
grant select,update on public.staff_access_requests to service_role;
create index staff_access_queued on public.staff_access_requests(created_at) where status='queued';
create index staff_access_requestor on public.staff_access_requests(tenant_id,requested_by);
create index staff_access_account on public.staff_access_requests(account_id);
create trigger staff_access_audit after insert or update on public.staff_access_requests for each row execute function public.record_audit();

create function public.claim_finance_staff_request() returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.staff_access_requests;account uuid;
begin
 select * into q from public.staff_access_requests where status='queued' order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 if not exists(select 1 from public.memberships where tenant_id=q.tenant_id and user_id=q.requested_by and role='owner') then
  update public.staff_access_requests set status='failed',last_error='Owner authorisation is no longer valid' where id=q.id;return null;
 end if;
 select id into account from auth.users where lower(email)=q.email;
 if account is not null and exists(select 1 from public.memberships where user_id=account and (tenant_id<>q.tenant_id or role<>'staff')) then
  update public.staff_access_requests set status='failed',last_error='Email is already linked to a different account role or workspace' where id=q.id;return null;
 end if;
 update public.staff_access_requests set status='processing',processed_at=now() where id=q.id;
 return jsonb_build_object('id',q.id,'tenant_id',q.tenant_id,'email',q.email,'name',q.name,'account_id',account);
end;$$;
create function public.link_finance_staff_request(request_id uuid,account uuid) returns void language plpgsql security definer set search_path='' as $$
declare q public.staff_access_requests;
begin
 select * into q from public.staff_access_requests where id=request_id and status='processing' for update;
 if not found then raise exception 'Onboarding request unavailable';end if;
 if not exists(select 1 from public.memberships where tenant_id=q.tenant_id and user_id=q.requested_by and role='owner') then raise exception 'Owner authorisation required';end if;
 perform 1 from auth.users where id=account and lower(email)=q.email for update;
 if not found then raise exception 'Account email does not match the authorised invitation';end if;
 if exists(select 1 from public.memberships where user_id=account and (tenant_id<>q.tenant_id or role<>'staff')) then raise exception 'Account belongs to a different role or workspace';end if;
 insert into public.memberships(tenant_id,user_id,role) values(q.tenant_id,account,'staff') on conflict(tenant_id,user_id) do nothing;
 insert into public.member_permissions(tenant_id,user_id,capability) select q.tenant_id,account,c from unnest(array['finance','finance_admin','payroll','payroll_admin']) c on conflict do nothing;
 insert into public.staff_directory(tenant_id,user_id,name,email,job_title,department) values(q.tenant_id,account,q.name,q.email,'Finance & Payroll Administrator','Finance') on conflict(tenant_id,user_id) do update set name=excluded.name,email=excluded.email,job_title=excluded.job_title,department=excluded.department;
 update public.staff_access_requests set account_id=account where id=q.id;
end;$$;
revoke all on function public.claim_finance_staff_request(),public.link_finance_staff_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_finance_staff_request(),public.link_finance_staff_request(uuid,uuid) to service_role;
commit;
