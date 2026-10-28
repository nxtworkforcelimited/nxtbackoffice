begin;
create table public.sms_templates(
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 event text not null check(event in ('welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved')),
 body text not null check(length(trim(body)) between 1 and 480),
 enabled boolean not null default true,
 primary key(tenant_id,event)
);
alter table public.sms_templates enable row level security;
grant select,insert,update on public.sms_templates to authenticated;
revoke all on public.sms_templates from anon;
create policy sms_templates_read on public.sms_templates for select to authenticated using(public.has_capability(tenant_id,'sms'));
create policy sms_templates_insert on public.sms_templates for insert to authenticated with check(public.has_capability(tenant_id,'sms'));
create policy sms_templates_update on public.sms_templates for update to authenticated using(public.has_capability(tenant_id,'sms')) with check(public.has_capability(tenant_id,'sms'));
insert into public.sms_templates(tenant_id,event,body)
select s.tenant_id,d.event,d.body from public.sms_settings s cross join (values
 ('welcome','Welcome to NXT Workforce, {name}! Thank you for joining us. Your account is ready: {portal_link}'),
 ('invoice_sent','Hi {name}, invoice {invoice_number} is available. View it in your portal: {portal_link}'),
 ('project_update','Hi {name}, there is a new update on {project_name}. View it in your portal: {portal_link}'),
 ('project_completed','Hi {name}, {project_name} is complete! Please check your portal: {portal_link}'),
 ('ticket_received','Hi {name}, we have received ticket {ticket_number}. Track progress in your portal: {portal_link}'),
 ('ticket_resolved','Hi {name}, ticket {ticket_number} has been resolved. Please check your portal: {portal_link}')
) d(event,body) on conflict do nothing;
alter table public.sms_outbox drop constraint if exists sms_outbox_source_type_check;
alter table public.sms_outbox add constraint sms_outbox_source_type_check check(source_type in ('task','project','social_post','manual_test','welcome','invoice_sent','project_update','project_completed','ticket_received','ticket_resolved'));

-- Trigger-only helper. No public RPC can send arbitrary SMS or bypass contact consent.
create function nxt_private.queue_template_sms(t uuid,c uuid,e text,s uuid,k text,vars jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare contact public.clients;template text;pair record;
begin
 select * into contact from public.clients where tenant_id=t and id=c and archived_at is null;
 if not found or not coalesce(contact.approval_sms_enabled,false) or coalesce(contact.phone,'') !~ '^[+][1-9][0-9]{7,14}$' then return;end if;
 if not exists(select 1 from public.sms_settings where tenant_id=t and enabled) then return;end if;
 select body into template from public.sms_templates where tenant_id=t and event=e and enabled;
 if template is null then return;end if;
 template:=replace(replace(template,'{name}',left(contact.title,60)),'{portal_link}','https://os.nxt-workforce.com/login');
 for pair in select key,value from jsonb_each_text(vars) loop
  template:=replace(template,'{'||pair.key||'}',left(pair.value,80));
 end loop;
 -- Placeholder names are validated by the editor API before saving.
 insert into public.sms_outbox(tenant_id,client_id,source_type,source_id,approval_key,recipient,body)
 values(t,c,e,s,t::text||':'||e||':'||k,contact.phone,template) on conflict(approval_key) do nothing;
end;$$;
revoke all on function nxt_private.queue_template_sms(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;

create function nxt_private.client_event_sms() returns trigger language plpgsql security definer set search_path='' as $$
declare ci uuid;e text;v jsonb:='{}';k text;
begin
 if tg_table_name='memberships' then
  if new.role<>'client' or new.client_id is null then return new;end if;
  if tg_op='UPDATE' and old.role=new.role and old.client_id is not distinct from new.client_id then return new;end if;
  ci:=new.client_id;e:='welcome';k:=ci::text;
  perform nxt_private.queue_template_sms(new.tenant_id,ci,e,ci,k,v);return new;
 elsif tg_table_name='business_items' then
  if new.kind<>'invoice' or new.status<>'issued' or new.client_id is null then return new;end if;
  if tg_op='UPDATE' and old.status='issued' then return new;end if;
  ci:=new.client_id;e:='invoice_sent';k:=new.id::text;v:=jsonb_build_object('invoice_number',new.reference);
 elsif tg_table_name='projects' then
  if not new.client_visible or new.client_id is null or new.archived_at is not null then return new;end if;
  if tg_op='UPDATE' and new.status is not distinct from old.status and new.client_visible is not distinct from old.client_visible and new.description is not distinct from old.description then return new;end if;
  if new.status='completed' then e:='project_completed';
  elsif new.status='approved' then e:='project_update';else return new;end if;
  ci:=new.client_id;k:=new.id::text||':'||new.updated_at::text;v:=jsonb_build_object('project_name',new.title);
 elsif tg_table_name='it_tickets' then
  select client_id into ci from public.memberships where tenant_id=new.tenant_id and user_id=new.requester_id and role='client';
  if ci is null then return new;end if;
  if tg_op='INSERT' then e:='ticket_received';k:=new.id::text;
  elsif new.status in ('Resolved','Closed') and old.status not in ('Resolved','Closed') then e:='ticket_resolved';k:=new.id::text||':'||new.updated_at::text;
  else return new;end if;
  v:=jsonb_build_object('ticket_number',new.reference);
 else return new;end if;
 perform nxt_private.queue_template_sms(new.tenant_id,ci,e,new.id,k,v);
 return new;
end;$$;
revoke all on function nxt_private.client_event_sms() from public,anon,authenticated;
create trigger template_welcome_sms after insert or update on public.memberships for each row execute function nxt_private.client_event_sms();
create trigger template_invoice_sms after insert or update on public.business_items for each row execute function nxt_private.client_event_sms();
-- Replace the old fixed-copy project notifier so approved projects don't send twice.
drop trigger if exists projects_client_sms on public.projects;
create trigger template_project_sms after insert or update on public.projects for each row execute function nxt_private.client_event_sms();
create trigger template_ticket_sms after insert or update on public.it_tickets for each row execute function nxt_private.client_event_sms();

-- Keep client support permissions explicit and reproducible in source.
alter table public.it_tickets add column if not exists project_id uuid;
alter table public.it_ticket_comments add column if not exists internal boolean not null default false;
drop policy if exists ticket_create on public.it_tickets;
create policy ticket_create on public.it_tickets for insert to authenticated with check(
 requester_id=(select auth.uid()) and assignee_id is null and status='New' and resolution='' and resolved_at is null and resolved_by is null and
 (public.is_staff(tenant_id) or (public.workspace_role_for(tenant_id)='client' and backoffice_id is null and device_id is null and
 (project_id is null or exists(select 1 from public.projects p where p.id=project_id and p.tenant_id=it_tickets.tenant_id and p.client_visible and p.archived_at is null and public.can_read_client(p.tenant_id,p.client_id))))));
drop policy if exists ticket_read on public.it_tickets;
create policy ticket_read on public.it_tickets for select to authenticated using(public.workspace_role_for(tenant_id) is not null and (requester_id=(select auth.uid()) or public.has_capability(tenant_id,'tickets')));
drop policy if exists ticket_comment_read on public.it_ticket_comments;
create policy ticket_comment_read on public.it_ticket_comments for select to authenticated using((not internal or public.has_capability(tenant_id,'tickets')) and exists(select 1 from public.it_tickets t where t.id=ticket_id and t.tenant_id=it_ticket_comments.tenant_id));
drop policy if exists ticket_comment_create on public.it_ticket_comments;
create policy ticket_comment_create on public.it_ticket_comments for insert to authenticated with check(author_id=(select auth.uid()) and (not internal or public.has_capability(tenant_id,'tickets')) and exists(select 1 from public.it_tickets t where t.id=ticket_id and t.tenant_id=it_ticket_comments.tenant_id));
commit;
