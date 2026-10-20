-- Run once after the team operations upgrade. Owner-only invitation reservations and account linking.
begin;
create schema if not exists nxt_private;
revoke all on schema nxt_private from public,anon;
grant usage on schema nxt_private to authenticated;
create table public.client_invitations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,client_id uuid not null,
 email text not null,invited_by uuid not null,created_at timestamptz not null default now(),
 status text not null default 'preparing' check(status in ('preparing','sent','failed')),
 sent_at timestamptz,last_error text,
 foreign key(tenant_id,client_id) references public.clients(tenant_id,id),
 foreign key(tenant_id,invited_by) references public.memberships(tenant_id,user_id)
);
alter table public.client_invitations enable row level security;
create policy client_invites_owner_read on public.client_invitations for select to authenticated using(public.workspace_role_for(tenant_id)='owner');
revoke all on public.client_invitations from public,anon,authenticated;
grant select on public.client_invitations to authenticated;
grant select,update on public.client_invitations to service_role;
create index client_invites_parent on public.client_invitations(tenant_id,client_id,created_at desc);
create function nxt_private.reserve_client_invite(t uuid,c uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cl public.clients; invitation uuid;begin
 if auth.uid() is null or public.workspace_role_for(t) is distinct from 'owner' then raise exception 'Only the workspace owner can invite clients';end if;
 select * into cl from public.clients where tenant_id=t and id=c and archived_at is null and status='active' for update;
 if not found then raise exception 'Choose an active client in this workspace';end if;
 if cl.email is null or trim(cl.email)='' then raise exception 'Save the client email before inviting';end if;
 if exists(select 1 from public.client_invitations i where i.tenant_id=t and i.client_id=c and i.created_at>now()-interval '60 seconds') then raise exception 'Please wait 60 seconds before sending another invitation';end if;
 -- Reject staff or an account already attached to a different client/workspace before sending any email.
 if exists(select 1 from auth.users u join public.memberships m on m.user_id=u.id where lower(u.email)=lower(trim(cl.email)) and (m.role<>'client' or m.tenant_id<>t or m.client_id is distinct from c)) then raise exception 'This email belongs to a staff account or another client. Use a separate client email';end if;
 insert into public.client_invitations(tenant_id,client_id,email,invited_by) values(t,c,lower(trim(cl.email)),auth.uid()) returning id into invitation;
 return jsonb_build_object('id',invitation,'email',lower(trim(cl.email)),'client_title',cl.title);
end;$$;
create function nxt_private.link_client_login(t uuid,c uuid,invitation uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare address text;account_id uuid;begin
 if auth.uid() is null or public.workspace_role_for(t) is distinct from 'owner' then raise exception 'Only the workspace owner can link client accounts';end if;
 perform 1 from public.clients where tenant_id=t and id=c and archived_at is null and status='active' for update;
 if not found then raise exception 'Choose an active client in this workspace';end if;
 select i.email into address from public.client_invitations i join public.clients cl on cl.tenant_id=i.tenant_id and cl.id=i.client_id where i.id=invitation and i.tenant_id=t and i.client_id=c and i.invited_by=auth.uid() and i.status='preparing' and lower(trim(cl.email))=i.email and i.created_at>now()-interval '5 minutes';
 if address is null then raise exception 'Invitation expired or client email changed. Start a new invitation';end if;
 select u.id into account_id from auth.users u where lower(u.email)=address for update;
 if account_id is null then return null;end if;
 if exists(select 1 from public.memberships m where m.user_id=account_id and (m.role<>'client' or m.tenant_id<>t or m.client_id is distinct from c)) then raise exception 'This email belongs to a staff account or another client. Use a separate client email';end if;
 insert into public.memberships(tenant_id,user_id,role,client_id) values(t,account_id,'client',c) on conflict(tenant_id,user_id) do nothing;
 return account_id;
end;$$;
revoke all on function nxt_private.reserve_client_invite(uuid,uuid),nxt_private.link_client_login(uuid,uuid,uuid) from public,anon;
grant execute on function nxt_private.reserve_client_invite(uuid,uuid),nxt_private.link_client_login(uuid,uuid,uuid) to authenticated;
create function public.reserve_client_invite(t uuid,c uuid) returns jsonb language sql security invoker set search_path='' as $$select nxt_private.reserve_client_invite(t,c);$$;
create function public.link_client_login(t uuid,c uuid,invitation uuid) returns uuid language sql security invoker set search_path='' as $$select nxt_private.link_client_login(t,c,invitation);$$;
revoke all on function public.reserve_client_invite(uuid,uuid),public.link_client_login(uuid,uuid,uuid) from public,anon;
grant execute on function public.reserve_client_invite(uuid,uuid),public.link_client_login(uuid,uuid,uuid) to authenticated;
commit;
