-- Lets workspace admins and staff holding the HR capability request staff password-reset emails,
-- in addition to the owner. Only the owner can reset the owner's own account request.
-- Invitations are deliberately NOT changed here.
begin;
create or replace function public.can_manage_staff_access(t uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.workspace_role_for(t) in ('owner','admin'),false)
  or (coalesce(public.workspace_role_for(t)='staff',false)
      and exists(select 1 from public.member_permissions where tenant_id=t and user_id=(select auth.uid()) and capability='hr'))
$$;
revoke all on function public.can_manage_staff_access(uuid) from public,anon;
grant execute on function public.can_manage_staff_access(uuid) to authenticated;

drop policy if exists staff_password_reset_owner_read on public.staff_password_reset_requests;
drop policy if exists staff_password_reset_manager_read on public.staff_password_reset_requests;
create policy staff_password_reset_manager_read on public.staff_password_reset_requests for select to authenticated using(public.can_manage_staff_access(tenant_id));

create or replace function public.request_staff_password_reset(t uuid,member uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare recipient text;q public.staff_password_reset_requests;target_role public.workspace_role;
begin
 if auth.uid() is null or not public.can_manage_staff_access(t) then raise exception 'Staff access administration permission required';end if;
 select m.role,lower(u.email) into target_role,recipient from auth.users u join public.memberships m on m.user_id=u.id
 where m.tenant_id=t and m.user_id=member and m.role in ('owner','admin','staff') and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now());
 if recipient is null then raise exception 'An active, verified staff account in this workspace is required';end if;
 if target_role='owner' and public.workspace_role_for(t) is distinct from 'owner' then raise exception 'Only the workspace owner can request a reset for the owner account';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||member::text||'staff-recovery',0));
 select * into q from public.staff_password_reset_requests where tenant_id=t and user_id=member and status in ('queued','processing') limit 1;
 if found then return jsonb_build_object('id',q.id,'email',q.email,'status',q.status);end if;
 if exists(select 1 from public.staff_password_reset_requests where tenant_id=t and user_id=member and created_at>now()-interval '10 minutes') then raise exception 'A reset was requested recently. Check the inbox before requesting another';end if;
 insert into public.staff_password_reset_requests(tenant_id,user_id,email,requested_by) values(t,member,recipient,auth.uid()) returning * into q;
 return jsonb_build_object('id',q.id,'email',q.email,'status',q.status);
end;$$;

-- The sender is re-checked when the email is prepared: still owner, admin, or HR.
create or replace function public.claim_staff_password_reset() returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.staff_password_reset_requests;display_name text;
begin
 select * into q from public.staff_password_reset_requests where status='queued' order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 if not exists(select 1 from public.memberships m where m.tenant_id=q.tenant_id and m.user_id=q.requested_by
     and (m.role in ('owner','admin') or (m.role='staff' and exists(select 1 from public.member_permissions p where p.tenant_id=m.tenant_id and p.user_id=m.user_id and p.capability='hr'))))
 or not exists(select 1 from auth.users u join public.memberships m on m.user_id=u.id where m.tenant_id=q.tenant_id and m.user_id=q.user_id and m.role in ('owner','admin','staff') and lower(u.email)=q.email and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then
  update public.staff_password_reset_requests set status='failed',last_error='Account or requester authorisation changed; request was not processed' where id=q.id;return null;
 end if;
 select name into display_name from public.staff_directory where tenant_id=q.tenant_id and user_id=q.user_id;
 update public.staff_password_reset_requests set status='processing',processed_at=now() where id=q.id;
 return jsonb_build_object('id',q.id,'tenant_id',q.tenant_id,'user_id',q.user_id,'email',q.email,'name',coalesce(display_name,'there'));
end;$$;
commit;
