-- ServiceNow-style NXT IT service desk
-- Ticket numbering, lifecycle notifications, requester privacy and support-manager access.

create sequence if not exists public.it_ticket_number_seq start with 1 increment by 1;

alter table public.it_tickets
  alter column reference set default ('INC' || lpad(nextval('public.it_ticket_number_seq')::text, 7, '0')),
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz;

create unique index if not exists it_tickets_tenant_reference_key
  on public.it_tickets(tenant_id, reference);

alter table public.notification_outbox
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists event_key text;

create unique index if not exists notification_outbox_event_key_unique
  on public.notification_outbox(event_key)
  where event_key is not null;

-- Provision Adrian as the current IT support manager when his account exists.
insert into public.member_permissions(tenant_id,user_id,capability)
select m.tenant_id,m.user_id,'tickets'
from public.memberships m
join auth.users u on u.id=m.user_id
where lower(u.email)='adrian@nxt-workforce.com'
  and m.role in ('owner','admin','staff')
on conflict do nothing;

create or replace function public.guard_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op='UPDATE'
     and (
       new.tenant_id<>old.tenant_id
       or new.requester_id<>old.requester_id
       or new.id<>old.id
       or new.reference<>old.reference
     )
  then
    raise exception 'Ticket identity cannot change';
  end if;

  if new.assignee_id is not null
     and not public.has_capability(new.tenant_id,'tickets')
  then
    raise exception 'Ticket manager required';
  end if;

  if new.status in ('Resolved','Closed')
     and length(trim(new.resolution))=0
  then
    raise exception 'Add a resolution before closing';
  end if;

  if tg_op='UPDATE'
     and old.status is distinct from new.status
     and new.status in ('Resolved','Closed')
     and old.status not in ('Resolved','Closed')
  then
    new.resolved_by := auth.uid();
    new.resolved_at := now();
  elsif tg_op='UPDATE'
     and old.status in ('Resolved','Closed')
     and new.status not in ('Resolved','Closed')
  then
    new.resolved_by := null;
    new.resolved_at := null;
  end if;

  new.updated_at:=now();
  return new;
end;
$$;

create or replace function nxt_private.queue_ticket_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_email text;
  requester_name text;
  resolver_name text;
  admin_email constant text := 'adrian@nxt-workforce.com';
  ticket_url constant text := 'https://nxt-business-os.vercel.app/app';
  event_suffix text;
begin
  select lower(u.email), coalesce(sd.name,u.email)
    into requester_email, requester_name
  from auth.users u
  left join public.staff_directory sd
    on sd.tenant_id=new.tenant_id and sd.user_id=u.id
  where u.id=new.requester_id;

  if tg_op='INSERT' then
    insert into public.notification_outbox(
      tenant_id,recipient,subject,body,source_type,source_id,event_key
    )
    values(
      new.tenant_id,
      admin_email,
      '['||new.reference||'] New '||new.priority||' IT ticket: '||new.title,
      'A new IT ticket needs attention.'||E'\n\n'||
      'Ticket: '||new.reference||E'\n'||
      'Requester: '||coalesce(requester_name,'Unknown')||
        case when requester_email is not null then ' <'||requester_email||'>' else '' end||E'\n'||
      'Priority: '||new.priority||E'\n'||
      'Category: '||new.category||E'\n'||
      'Status: '||new.status||E'\n'||
      'Opened: '||to_char(new.created_at at time zone 'Africa/Harare','DD Mon YYYY HH24:MI')||E'\n\n'||
      'Short description: '||new.title||E'\n\n'||
      'Open NXT Business OS → IT Tickets: '||ticket_url,
      'it_ticket',
      new.id,
      'it_ticket:'||new.id::text||':created:admin'
    )
    on conflict do nothing;

    if requester_email is not null and position('@' in requester_email)>1 then
      insert into public.notification_outbox(
        tenant_id,recipient,subject,body,source_type,source_id,event_key
      )
      values(
        new.tenant_id,
        requester_email,
        '['||new.reference||'] Ticket received: '||new.title,
        'Hi '||coalesce(requester_name,'there')||','||E'\n\n'||
        'Your IT ticket has been logged and assigned the reference '||new.reference||'.'||E'\n\n'||
        'Priority: '||new.priority||E'\n'||
        'Category: '||new.category||E'\n'||
        'Status: New'||E'\n'||
        'Opened: '||to_char(new.created_at at time zone 'Africa/Harare','DD Mon YYYY HH24:MI')||E'\n\n'||
        'You will receive another notification when the ticket is resolved.'||E'\n\n'||
        'NXT Workforce IT Support',
        'it_ticket',
        new.id,
        'it_ticket:'||new.id::text||':created:requester'
      )
      on conflict do nothing;
    end if;

  elsif tg_op='UPDATE'
    and old.status is distinct from new.status
    and new.status in ('Resolved','Closed')
    and old.status not in ('Resolved','Closed')
  then
    if new.resolved_by is not null then
      select coalesce(sd.name,u.email)
        into resolver_name
      from auth.users u
      left join public.staff_directory sd
        on sd.tenant_id=new.tenant_id and sd.user_id=u.id
      where u.id=new.resolved_by;
    end if;

    event_suffix := coalesce(
      extract(epoch from new.resolved_at)::bigint::text,
      extract(epoch from now())::bigint::text
    );

    if requester_email is not null and position('@' in requester_email)>1 then
      insert into public.notification_outbox(
        tenant_id,recipient,subject,body,source_type,source_id,event_key
      )
      values(
        new.tenant_id,
        requester_email,
        '['||new.reference||'] Resolved: '||new.title,
        'Hi '||coalesce(requester_name,'there')||','||E'\n\n'||
        'Your IT ticket '||new.reference||' has been resolved.'||E'\n\n'||
        'Issue: '||new.title||E'\n'||
        'Resolution: '||new.resolution||E'\n'||
        'Resolved by: '||coalesce(resolver_name,'NXT IT Support')||E'\n'||
        'Resolved: '||to_char(coalesce(new.resolved_at,now()) at time zone 'Africa/Harare','DD Mon YYYY HH24:MI')||E'\n\n'||
        'If the issue is not resolved, please log a new ticket or contact IT support.'||E'\n\n'||
        'NXT Workforce IT Support',
        'it_ticket',
        new.id,
        'it_ticket:'||new.id::text||':resolved:'||event_suffix
      )
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function nxt_private.queue_ticket_notifications() from public, anon, authenticated;

drop trigger if exists ticket_notifications on public.it_tickets;
create trigger ticket_notifications
after insert or update on public.it_tickets
for each row execute function nxt_private.queue_ticket_notifications();

drop policy if exists ticket_read on public.it_tickets;
create policy ticket_read
on public.it_tickets
for select
to authenticated
using (
  requester_id=(select auth.uid())
  or public.has_capability(tenant_id,'tickets')
);

drop policy if exists ticket_comment_read on public.it_ticket_comments;
create policy ticket_comment_read
on public.it_ticket_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.it_tickets t
    where t.id=it_ticket_comments.ticket_id
      and t.tenant_id=it_ticket_comments.tenant_id
      and (
        t.requester_id=(select auth.uid())
        or public.has_capability(t.tenant_id,'tickets')
      )
  )
);

drop policy if exists ticket_comment_create on public.it_ticket_comments;
create policy ticket_comment_create
on public.it_ticket_comments
for insert
to authenticated
with check (
  author_id=(select auth.uid())
  and exists (
    select 1
    from public.it_tickets t
    where t.id=it_ticket_comments.ticket_id
      and t.tenant_id=it_ticket_comments.tenant_id
      and (
        t.requester_id=(select auth.uid())
        or public.has_capability(t.tenant_id,'tickets')
      )
  )
);
