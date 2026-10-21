-- Owner-authorised recovery for existing staff. Never grants permissions or changes passwords itself.
begin;
create table public.staff_password_reset_requests(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 user_id uuid not null,email text not null,requested_by uuid not null,
 status text not null default 'queued' check(status in ('queued','processing','sent','failed')),
 created_at timestamptz not null default now(),processed_at timestamptz,sent_at timestamptz,last_error text,
 foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id),
 foreign key(tenant_id,requested_by) references public.memberships(tenant_id,user_id)
);
alter table public.staff_password_reset_requests enable row level security;
create policy staff_password_reset_owner_read on public.staff_password_reset_requests for select to authenticated using(public.workspace_role_for(tenant_id)='owner');
revoke all on public.staff_password_reset_requests from public,anon,authenticated;
grant select on public.staff_password_reset_requests to authenticated;
grant select,update on public.staff_password_reset_requests to service_role;
create unique index staff_password_reset_pending on public.staff_password_reset_requests(tenant_id,user_id) where status in ('queued','processing');
create index staff_password_reset_created on public.staff_password_reset_requests(created_at) where status='queued';
create trigger staff_password_reset_audit after insert or update on public.staff_password_reset_requests for each row execute function public.record_audit();
create function public.request_staff_password_reset(t uuid,member uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare recipient text;q public.staff_password_reset_requests;
begin
 if auth.uid() is null or public.workspace_role_for(t) is distinct from 'owner' then raise exception 'Workspace owner required';end if;
 select lower(u.email) into recipient from auth.users u join public.memberships m on m.user_id=u.id
 where m.tenant_id=t and m.user_id=member and m.role in ('owner','admin','staff') and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now());
 if recipient is null then raise exception 'An active, verified staff account in this workspace is required';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||member::text||'staff-recovery',0));
 select * into q from public.staff_password_reset_requests where tenant_id=t and user_id=member and status in ('queued','processing') limit 1;
 if found then return jsonb_build_object('id',q.id,'email',q.email,'status',q.status);end if;
 if exists(select 1 from public.staff_password_reset_requests where tenant_id=t and user_id=member and created_at>now()-interval '10 minutes') then raise exception 'A reset was requested recently. Check the inbox before requesting another';end if;
 insert into public.staff_password_reset_requests(tenant_id,user_id,email,requested_by) values(t,member,recipient,auth.uid()) returning * into q;
 return jsonb_build_object('id',q.id,'email',q.email,'status',q.status);
end;$$;
create function public.claim_staff_password_reset() returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.staff_password_reset_requests;display_name text;
begin
 select * into q from public.staff_password_reset_requests where status='queued' order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 if not exists(select 1 from public.memberships where tenant_id=q.tenant_id and user_id=q.requested_by and role='owner')
 or not exists(select 1 from auth.users u join public.memberships m on m.user_id=u.id where m.tenant_id=q.tenant_id and m.user_id=q.user_id and m.role in ('owner','admin','staff') and lower(u.email)=q.email and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then
  update public.staff_password_reset_requests set status='failed',last_error='Account or owner authorisation changed; request was not processed' where id=q.id;return null;
 end if;
 select name into display_name from public.staff_directory where tenant_id=q.tenant_id and user_id=q.user_id;
 update public.staff_password_reset_requests set status='processing',processed_at=now() where id=q.id;
 return jsonb_build_object('id',q.id,'tenant_id',q.tenant_id,'user_id',q.user_id,'email',q.email,'name',coalesce(display_name,'there'));
end;$$;
revoke all on function public.request_staff_password_reset(uuid,uuid),public.claim_staff_password_reset() from public,anon,authenticated;
grant execute on function public.request_staff_password_reset(uuid,uuid) to authenticated;
grant execute on function public.claim_staff_password_reset() to service_role;
commit;
