-- Email ticket requesters when IT support posts an update.

create or replace function nxt_private.queue_ticket_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.it_tickets;
  requester_email text;
  requester_name text;
  author_name text;
  author_is_support boolean := false;
begin
  select * into t
  from public.it_tickets
  where id=new.ticket_id
    and tenant_id=new.tenant_id;

  if not found then
    return new;
  end if;

  -- Requester replies remain in the ticket timeline but do not email themselves.
  if new.author_id = t.requester_id then
    return new;
  end if;

  select (
    exists (
      select 1
      from public.memberships m
      where m.tenant_id=new.tenant_id
        and m.user_id=new.author_id
        and m.role='owner'
    )
    or exists (
      select 1
      from public.member_permissions mp
      where mp.tenant_id=new.tenant_id
        and mp.user_id=new.author_id
        and mp.capability='tickets'
    )
  ) into author_is_support;

  if not author_is_support then
    return new;
  end if;

  select lower(u.email), coalesce(sd.name,u.email)
    into requester_email, requester_name
  from auth.users u
  left join public.staff_directory sd
    on sd.tenant_id=new.tenant_id
   and sd.user_id=u.id
  where u.id=t.requester_id;

  select coalesce(sd.name,u.email)
    into author_name
  from auth.users u
  left join public.staff_directory sd
    on sd.tenant_id=new.tenant_id
   and sd.user_id=u.id
  where u.id=new.author_id;

  if requester_email is null or position('@' in requester_email)<=1 then
    return new;
  end if;

  insert into public.notification_outbox(
    tenant_id,recipient,subject,body,source_type,source_id,event_key
  )
  values(
    new.tenant_id,
    requester_email,
    '['||t.reference||'] Ticket update: '||t.title,
    'Hi '||coalesce(requester_name,'there')||','||E'\n\n'||
    'There is a new update on your IT ticket.'||E'\n\n'||
    'Ticket: '||t.reference||E'\n'||
    'Issue: '||t.title||E'\n'||
    'Status: '||t.status||E'\n'||
    'Updated by: '||coalesce(author_name,'NXT IT Support')||E'\n'||
    'Updated: '||to_char(new.created_at at time zone 'Africa/Harare','DD Mon YYYY HH24:MI')||E'\n\n'||
    'Update:'||E'\n'||new.body||E'\n\n'||
    'Open NXT Business OS → IT Tickets: https://nxt-business-os.vercel.app/app'||E'\n\n'||
    'NXT Workforce IT Support',
    'it_ticket',
    t.id,
    'it_ticket:'||t.id::text||':comment:'||new.id::text||':requester'
  )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function nxt_private.queue_ticket_comment_notification()
from public, anon, authenticated;

drop trigger if exists ticket_comment_notification
on public.it_ticket_comments;

create trigger ticket_comment_notification
after insert on public.it_ticket_comments
for each row execute function nxt_private.queue_ticket_comment_notification();
