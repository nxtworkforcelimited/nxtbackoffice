-- Additive upgrade: requires upgrade-client-invitations.sql. No passwords or tokens are returned.
begin;
alter table public.client_invitations add column purpose text not null default 'invite' check(purpose in ('invite','reset'));
create or replace function nxt_private.client_portal_state(t uuid,c uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cl public.clients; account record;
begin
 if auth.uid() is null or public.workspace_role_for(t) is distinct from 'owner' then raise exception 'Only the workspace owner can inspect client login status';end if;
 select * into cl from public.clients where tenant_id=t and id=c;
 if not found then raise exception 'Client not found in this workspace';end if;
 select u.id,u.email,u.email_confirmed_at,u.last_sign_in_at,coalesce(length(u.encrypted_password)>0,false) as password_set,(u.banned_until is not null and u.banned_until>now()) as suspended
 into account from public.memberships m join auth.users u on u.id=m.user_id
 where m.tenant_id=t and m.client_id=c and m.role='client' and lower(u.email)=lower(trim(cl.email)) limit 1;
 if not found then return jsonb_build_object('linked',false,'password_set',false,'email_confirmed',false,'last_sign_in_at',null,'suspended',false,'email',cl.email);end if;
 return jsonb_build_object('linked',true,'password_set',account.password_set,'email_confirmed',account.email_confirmed_at is not null,'last_sign_in_at',account.last_sign_in_at,'suspended',account.suspended,'email',account.email);
end;$$;
revoke all on function nxt_private.client_portal_state(uuid,uuid) from public,anon;
grant execute on function nxt_private.client_portal_state(uuid,uuid) to authenticated;
create or replace function public.client_portal_state(t uuid,c uuid) returns jsonb language sql security invoker set search_path='' as $$select nxt_private.client_portal_state(t,c);$$;
revoke all on function public.client_portal_state(uuid,uuid) from public,anon;
grant execute on function public.client_portal_state(uuid,uuid) to authenticated;
commit;
