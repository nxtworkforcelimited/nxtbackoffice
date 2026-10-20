begin;
create table nxt_private.assistant_usage(
 tenant_id uuid not null,user_id uuid not null,hour timestamptz not null,requests integer not null check(requests between 1 and 10),
 primary key(tenant_id,user_id,hour),foreign key(tenant_id,user_id) references public.memberships(tenant_id,user_id) on delete cascade
);
revoke all on nxt_private.assistant_usage from public,anon,authenticated;
alter table nxt_private.assistant_usage enable row level security;
create function nxt_private.reserve_assistant_question(t uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare used integer;begin
 if auth.uid() is null or not exists(select 1 from public.memberships m where m.tenant_id=t and m.user_id=auth.uid()) then raise exception 'Workspace access required';end if;
 insert into nxt_private.assistant_usage as u(tenant_id,user_id,hour,requests) values(t,auth.uid(),date_trunc('hour',now()),1)
 on conflict(tenant_id,user_id,hour) do update set requests=u.requests+1 where u.requests<10 returning requests into used;
 return used is not null;
end;$$;
revoke all on function nxt_private.reserve_assistant_question(uuid) from public,anon;
grant execute on function nxt_private.reserve_assistant_question(uuid) to authenticated;
create function public.reserve_assistant_question(t uuid) returns boolean language sql security invoker set search_path='' as $$select nxt_private.reserve_assistant_question(t);$$;
revoke all on function public.reserve_assistant_question(uuid) from public,anon;
grant execute on function public.reserve_assistant_question(uuid) to authenticated;
commit;
