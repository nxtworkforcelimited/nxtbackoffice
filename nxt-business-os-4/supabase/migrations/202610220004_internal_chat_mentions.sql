-- Secure internal task/project @mention notifications.
begin;
create or replace function public.notify_work_mentions(t uuid,comment_id uuid,mentioned uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare c public.work_comments; parent jsonb; recipient record; sent integer:=0; clean uuid[];
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 select * into c from public.work_comments where id=comment_id and tenant_id=t for update;
 if not found or c.author_id<>auth.uid() then raise exception 'Comment unavailable';end if;
 if c.scope<>'internal' then raise exception 'Mentions are internal only';end if;
 if not public.is_staff(t) then raise exception 'Staff access required';end if;
 parent:=nxt_private.work_parent(t,c.kind,c.record_id);
 if parent is null then raise exception 'Work unavailable';end if;

 select array_agg(distinct x) into clean
 from unnest(coalesce(mentioned,'{}'::uuid[])) x
 where x<>auth.uid()
   and exists(select 1 from public.memberships m where m.tenant_id=t and m.user_id=x and m.role<>'client');

 if clean is null then return 0;end if;
 for recipient in
  select u.id,u.email,coalesce(sd.name,u.email) as name
  from unnest(clean) x
  join auth.users u on u.id=x
  left join public.staff_directory sd on sd.tenant_id=t and sd.user_id=x
  where u.email is not null
 loop
  insert into public.notification_outbox(tenant_id,recipient,subject,body)
  values(
   t,recipient.email,
   'You were tagged: '||left(coalesce(parent->>'title','NXT task'),120),
   'You were tagged in an internal '||case when c.kind='tasks' then 'task' else 'project' end||
   ' discussion: '||coalesce(parent->>'title','Work item')||'. Open NXT Business OS to reply.'
  );
  sent:=sent+1;
 end loop;
 return sent;
end;$$;
revoke all on function public.notify_work_mentions(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.notify_work_mentions(uuid,uuid,uuid[]) to authenticated;
commit;
