-- Tickets: client link, response and resolution deadlines, internal notes, time spent, extra categories.
-- Additive. No ticket or comment is deleted or rewritten. Existing tickets keep working; old ones without a stored deadline show one calculated in the app.
begin;

-- 1. Client link and deadlines
alter table public.it_tickets
 add column if not exists client_id uuid,
 add column if not exists first_response_due timestamptz,
 add column if not exists resolution_due timestamptz,
 add column if not exists first_response_at timestamptz;
alter table public.it_tickets drop constraint if exists it_tickets_tenant_client_fkey;
alter table public.it_tickets add constraint it_tickets_tenant_client_fkey foreign key(tenant_id,client_id) references public.clients(tenant_id,id);
create index if not exists it_tickets_client_idx on public.it_tickets(tenant_id,client_id);

-- 2. Categories: keep every value already in use and add the client website ones.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.it_tickets'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%category%' loop
  execute format('alter table public.it_tickets drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.it_tickets add constraint it_tickets_category_check check(category in (
 'Hardware','Software','Network','Account access',
 'General IT','Back Office / System','CRM / Pipeline','Projects / Tasks','Finance / Expenses','Accounting','Payroll','Leave / Loans','Tickets / IT Support','SMS / Messaging','Phone / Calling','Marketing / Social','Documents / Files','Account / Login Access','Hardware / Device','Network / Connectivity','Website / Domain','Other',
 'Website Change','Website Bug','Content Update','Hosting / DNS','Billing Query'));

-- 3. Internal notes and time spent on comments
alter table public.it_ticket_comments
 add column if not exists internal boolean not null default false,
 add column if not exists minutes integer;
alter table public.it_ticket_comments drop constraint if exists it_ticket_comments_minutes_check;
alter table public.it_ticket_comments add constraint it_ticket_comments_minutes_check check(minutes is null or minutes between 1 and 1440);

drop policy if exists ticket_comment_read on public.it_ticket_comments;
create policy ticket_comment_read on public.it_ticket_comments for select to authenticated using(
 exists(select 1 from public.it_tickets t where t.id=it_ticket_comments.ticket_id and t.tenant_id=it_ticket_comments.tenant_id and (
  public.has_capability(t.tenant_id,'tickets')
  or (t.requester_id=(select auth.uid()) and not it_ticket_comments.internal)
 )));
drop policy if exists ticket_comment_create on public.it_ticket_comments;
create policy ticket_comment_create on public.it_ticket_comments for insert to authenticated with check(
 author_id=(select auth.uid())
 and exists(select 1 from public.it_tickets t where t.id=it_ticket_comments.ticket_id and t.tenant_id=it_ticket_comments.tenant_id and (
  t.requester_id=(select auth.uid()) or public.has_capability(t.tenant_id,'tickets')))
 -- only ticket managers may write internal notes or log time
 and ((not internal and minutes is null) or public.has_capability(tenant_id,'tickets')));

-- 4. Deadlines from priority (clock hours): first reply / resolution
-- Urgent 1 / 4, High 4 / 24, Normal 8 / 72, Low 24 / 168. The first reply is recorded when the ticket leaves New or a manager replies.
create schema if not exists nxt_private;
create or replace function nxt_private.set_ticket_sla() returns trigger language plpgsql set search_path='' as $$
declare fh int; rh int;
begin
 fh:=case new.priority when 'Urgent' then 1 when 'High' then 4 when 'Low' then 24 else 8 end;
 rh:=case new.priority when 'Urgent' then 4 when 'High' then 24 when 'Low' then 168 else 72 end;
 if tg_op='INSERT' or new.priority is distinct from old.priority then
  new.first_response_due:=new.created_at+make_interval(hours=>fh);
  new.resolution_due:=new.created_at+make_interval(hours=>rh);
 end if;
 if tg_op='UPDATE' and old.status='New' and new.status<>'New' and new.first_response_at is null then new.first_response_at:=now();end if;
 return new;
end;$$;
revoke all on function nxt_private.set_ticket_sla() from public,anon,authenticated;
drop trigger if exists ticket_sla on public.it_tickets;
create trigger ticket_sla before insert or update on public.it_tickets for each row execute function nxt_private.set_ticket_sla();

-- 5. A manager's reply (not an internal note) counts as the first response and is emailed to the requester.
create or replace function nxt_private.ticket_comment_effects() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.it_tickets; email text; who text;
begin
 select * into t from public.it_tickets where id=new.ticket_id and tenant_id=new.tenant_id;
 if not found or new.internal or new.author_id=t.requester_id then return new;end if;
 update public.it_tickets set first_response_at=now() where id=t.id and first_response_at is null;
 select lower(u.email) into email from auth.users u where u.id=t.requester_id;
 select coalesce(sd.name,u.email) into who from auth.users u left join public.staff_directory sd on sd.tenant_id=new.tenant_id and sd.user_id=u.id where u.id=new.author_id;
 if email is not null and position('@' in email)>1 then
  insert into public.notification_outbox(tenant_id,recipient,subject,body,source_type,source_id,event_key)
  values(new.tenant_id,email,'['||t.reference||'] Update on your ticket: '||t.title,
   coalesce(who,'NXT IT Support')||' replied to your ticket '||t.reference||':'||E'\n\n'||new.body||E'\n\n'||'Open NXT Business OS, IT Tickets to reply.'||E'\n\n'||'NXT Workforce IT Support',
   'it_ticket',t.id,'it_ticket_comment:'||new.id::text)
  on conflict do nothing;
 end if;
 return new;
end;$$;
revoke all on function nxt_private.ticket_comment_effects() from public,anon,authenticated;
drop trigger if exists ticket_comment_effects on public.it_ticket_comments;
create trigger ticket_comment_effects after insert on public.it_ticket_comments for each row execute function nxt_private.ticket_comment_effects();

-- 6. Every ticket manager hears about a new ticket, not one fixed person.
-- The existing notice to the original support manager is left as it is; he is skipped here so he is not emailed twice.
create or replace function nxt_private.notify_ticket_managers() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
 for r in select distinct lower(u.email) as email,u.id as uid from public.member_permissions mp join auth.users u on u.id=mp.user_id
  where mp.tenant_id=new.tenant_id and mp.capability='tickets' and u.id<>new.requester_id and u.email is not null and lower(u.email)<>'adrian@nxt-workforce.com' loop
  insert into public.notification_outbox(tenant_id,recipient,subject,body,source_type,source_id,event_key)
  values(new.tenant_id,r.email,'['||new.reference||'] New '||new.priority||' ticket: '||new.title,
   'A new ticket needs attention.'||E'\n\n'||'Ticket: '||new.reference||E'\n'||'Priority: '||new.priority||E'\n'||'Category: '||new.category||E'\n'||'Reply due: '||to_char(new.first_response_due at time zone 'Africa/Harare','DD Mon YYYY HH24:MI')||E'\n\n'||new.title||E'\n\n'||'Open NXT Business OS, IT Tickets: https://nxt-business-os.vercel.app/app',
   'it_ticket',new.id,'it_ticket:'||new.id::text||':created:manager:'||r.uid::text)
  on conflict do nothing;
 end loop;
 return new;
end;$$;
revoke all on function nxt_private.notify_ticket_managers() from public,anon,authenticated;
drop trigger if exists ticket_notify_managers on public.it_tickets;
create trigger ticket_notify_managers after insert on public.it_tickets for each row execute function nxt_private.notify_ticket_managers();

commit;
