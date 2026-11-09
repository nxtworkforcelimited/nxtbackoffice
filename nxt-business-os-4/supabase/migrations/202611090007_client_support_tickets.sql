-- Client support tickets. NXT switches this on per client by ticking the services it looks after (website, back office, hosting...).
-- Clients can then raise tickets and follow them, and see only their own company's tickets and the replies meant for them.
-- Additive: no ticket, comment or client is deleted or rewritten.
begin;

alter table public.clients add column if not exists services text[] not null default '{}';
alter table public.clients drop constraint if exists clients_services_check;
alter table public.clients add constraint clients_services_check check(services <@ array['website','back_office','hosting','domain','email','other']::text[]);

-- More categories for client work (keeps every earlier value)
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.it_tickets'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%category%' loop
  execute format('alter table public.it_tickets drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.it_tickets add constraint it_tickets_category_check check(category in (
 'Hardware','Software','Network','Account access',
 'General IT','Back Office / System','CRM / Pipeline','Projects / Tasks','Finance / Expenses','Accounting','Payroll','Leave / Loans','Tickets / IT Support','SMS / Messaging','Phone / Calling','Marketing / Social','Documents / Files','Account / Login Access','Hardware / Device','Network / Connectivity','Website / Domain','Other',
 'Website Change','Website Bug','Content Update','Hosting / DNS','Billing Query',
 'Back Office Issue','Email Issue','Other Support Request'));

-- A client user may read the tickets of their own company, and the replies that are not internal notes. Nothing else.
drop policy if exists ticket_client_company_read on public.it_tickets;
create policy ticket_client_company_read on public.it_tickets for select to authenticated using(
 client_id is not null and exists(select 1 from public.memberships m where m.tenant_id=it_tickets.tenant_id and m.user_id=(select auth.uid()) and m.role='client' and m.client_id=it_tickets.client_id));
drop policy if exists ticket_comment_client_company_read on public.it_ticket_comments;
create policy ticket_comment_client_company_read on public.it_ticket_comments for select to authenticated using(
 not internal and exists(select 1 from public.it_tickets t join public.memberships m on m.tenant_id=t.tenant_id and m.client_id=t.client_id and m.role='client' and m.user_id=(select auth.uid())
  where t.id=it_ticket_comments.ticket_id and t.tenant_id=it_ticket_comments.tenant_id and t.client_id is not null));

-- Raising a ticket goes through this function so the rules cannot be skipped from a browser.
create or replace function public.create_client_ticket(t uuid,p_title text,p_description text,p_category text,p_priority text)
returns table(id uuid,reference text) language plpgsql security definer set search_path='' as $$
declare m public.memberships; c public.clients; cats text[]:=array['Billing Query']; svc text; r public.it_tickets;
begin
 select * into m from public.memberships where tenant_id=t and user_id=auth.uid() and role='client';
 if not found or m.client_id is null then raise exception 'Client access required';end if;
 select * into c from public.clients where tenant_id=t and public.clients.id=m.client_id and archived_at is null;
 if not found or coalesce(array_length(c.services,1),0)=0 then raise exception 'Support tickets are not switched on for your account yet. Please contact NXT Workforce.';end if;
 foreach svc in array c.services loop
  cats:=cats||case svc when 'website' then array['Website Change','Website Bug','Content Update'] when 'back_office' then array['Back Office Issue'] when 'hosting' then array['Hosting / DNS'] when 'domain' then array['Hosting / DNS'] when 'email' then array['Email Issue'] else array['Other Support Request'] end;
 end loop;
 if p_category is null or not p_category=any(cats) then raise exception 'Choose a category from the list.';end if;
 if p_priority is null or p_priority not in ('Low','Normal','High') then raise exception 'Choose how urgent this is.';end if;
 if length(btrim(coalesce(p_title,''))) not between 1 and 160 then raise exception 'Give the ticket a short title (up to 160 characters).';end if;
 if length(btrim(coalesce(p_description,''))) not between 1 and 5000 then raise exception 'Describe the problem (up to 5000 characters).';end if;
 if (select count(*) from public.it_tickets x where x.tenant_id=t and x.requester_id=auth.uid() and x.created_at>now()-interval '1 hour')>=5 then raise exception 'You have raised several tickets in the last hour. Please wait a little, or reply on an existing ticket.';end if;
 if (select count(*) from public.it_tickets x where x.tenant_id=t and x.client_id=c.id and x.status not in ('Resolved','Closed'))>=25 then raise exception 'You have many open tickets already. Please reply on an existing one or contact NXT Workforce.';end if;
 insert into public.it_tickets(tenant_id,requester_id,client_id,title,description,category,priority,status,device)
 values(t,auth.uid(),c.id,btrim(p_title),btrim(p_description),p_category,p_priority,'New','') returning * into r;
 return query select r.id,r.reference;
end;$$;
revoke all on function public.create_client_ticket(uuid,text,text,text,text) from public,anon;
grant execute on function public.create_client_ticket(uuid,text,text,text,text) to authenticated;

create or replace function public.add_client_ticket_comment(t uuid,p_ticket uuid,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.memberships; k public.it_tickets; cid uuid;
begin
 select * into m from public.memberships where tenant_id=t and user_id=auth.uid() and role='client';
 if not found or m.client_id is null then raise exception 'Client access required';end if;
 select * into k from public.it_tickets where public.it_tickets.id=p_ticket and tenant_id=t and client_id=m.client_id;
 if not found then raise exception 'Ticket not found';end if;
 if k.status in ('Resolved','Closed') then raise exception 'This ticket is resolved. Please raise a new ticket if the problem is back.';end if;
 if length(btrim(coalesce(p_body,''))) not between 1 and 5000 then raise exception 'Write a reply of up to 5000 characters.';end if;
 if (select count(*) from public.it_ticket_comments x where x.author_id=auth.uid() and x.created_at>now()-interval '1 hour')>=20 then raise exception 'Too many replies in the last hour. Please try again later.';end if;
 insert into public.it_ticket_comments(tenant_id,ticket_id,author_id,body,internal) values(t,p_ticket,auth.uid(),btrim(p_body),false) returning public.it_ticket_comments.id into cid;
 return cid;
end;$$;
revoke all on function public.add_client_ticket_comment(uuid,uuid,text) from public,anon;
grant execute on function public.add_client_ticket_comment(uuid,uuid,text) to authenticated;

-- A client cannot insert tickets straight into the table (for example with another company's client_id). Only create_client_ticket, which runs as the database owner, can.
create or replace function nxt_private.guard_client_ticket_insert() returns trigger language plpgsql set search_path='' as $$
begin
 -- Runs as the caller. Inside create_client_ticket the caller is the database owner, so only that function gets through.
 if current_user in ('authenticated','anon') and public.workspace_role_for(new.tenant_id)::text='client' then
  raise exception 'Raise tickets from the Support Tickets page';
 end if;
 return new;
end;$$;
revoke all on function nxt_private.guard_client_ticket_insert() from public,anon,authenticated;
drop trigger if exists ticket_client_insert_guard on public.it_tickets;
create trigger ticket_client_insert_guard before insert on public.it_tickets for each row execute function nxt_private.guard_client_ticket_insert();

-- When the person who raised a ticket replies, tell whoever has it (or every ticket manager if nobody does).
-- A manager's own reply to the requester behaves as before.
create or replace function nxt_private.ticket_comment_effects() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.it_tickets; email text; who text; r record;
begin
 select * into t from public.it_tickets where id=new.ticket_id and tenant_id=new.tenant_id;
 if not found or new.internal then return new;end if;
 select coalesce(sd.name,u.email) into who from auth.users u left join public.staff_directory sd on sd.tenant_id=new.tenant_id and sd.user_id=u.id where u.id=new.author_id;
 if new.author_id=t.requester_id or exists(select 1 from public.memberships cm where cm.tenant_id=new.tenant_id and cm.user_id=new.author_id and cm.role='client') then
  for r in select distinct lower(u.email) as email,u.id as uid from auth.users u where u.email is not null and u.id<>new.author_id and (
    (t.assignee_id is not null and u.id=t.assignee_id)
    or (t.assignee_id is null and exists(select 1 from public.member_permissions mp where mp.tenant_id=t.tenant_id and mp.user_id=u.id and mp.capability='tickets'))) loop
   insert into public.notification_outbox(tenant_id,recipient,subject,body,source_type,source_id,event_key)
   values(new.tenant_id,r.email,'['||t.reference||'] New reply on: '||t.title,
    coalesce(who,'The requester')||' replied on ticket '||t.reference||':'||E'\n\n'||new.body||E'\n\n'||'Open NXT Business OS, IT Tickets: https://nxt-business-os.vercel.app/app',
    'it_ticket',t.id,'it_ticket_comment:'||new.id::text||':mgr:'||r.uid::text) on conflict do nothing;
  end loop;
  return new;
 end if;
 update public.it_tickets set first_response_at=now() where id=t.id and first_response_at is null;
 select lower(u.email) into email from auth.users u where u.id=t.requester_id;
 if email is not null and position('@' in email)>1 then
  insert into public.notification_outbox(tenant_id,recipient,subject,body,source_type,source_id,event_key)
  values(new.tenant_id,email,'['||t.reference||'] Update on your ticket: '||t.title,
   'NXT Support replied to your ticket '||t.reference||':'||E'\n\n'||new.body||E'\n\n'||'Open your NXT portal and go to Support Tickets to reply.'||E'\n\n'||'NXT Workforce',
   'it_ticket',t.id,'it_ticket_comment:'||new.id::text) on conflict do nothing;
 end if;
 return new;
end;$$;
revoke all on function nxt_private.ticket_comment_effects() from public,anon,authenticated;

commit;
